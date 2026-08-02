import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OpenMateConfig, Secrets } from '@openmate/config';
import {
  type Budget,
  DirectProviderBackend,
  type ReasoningBackend,
  createProvider,
} from '@openmate/llm';
import { type Memory, createMemory } from '@openmate/memory';
import {
  type AgentEvent,
  CognitiveLoop,
  type Goal,
  type Task,
  TaskStore,
  type Trigger,
} from '@openmate/core';
import { Scheduler } from '@openmate/scheduler';
import { BrowserSession } from '@openmate/browser';
import { createExecutor } from '@openmate/computer';
import {
  type ApprovalRequest,
  type AutonomyPolicy,
  ToolRegistry,
  codeRunTool,
  createAgentTools,
  createBrowserTools,
  createComputerTools,
  createMemoryTools,
  createProjectTools,
  createScheduleTools,
  createTaskTools,
  type ScheduleInfo,
  type TaskInfo,
  fileTools,
  shellRunTool,
} from '@openmate/tools';
import { SqliteAuditSink } from './audit-sqlite.js';
import { type Schedule, ScheduleStore } from './schedule-store.js';

/** Auto-nega di un'approvazione senza risposta (evita blocchi della coda). */
const APPROVAL_TIMEOUT_MS = 120_000;
/** Ogni quanti heartbeat "a vuoto" concedere un ciclo di manutenzione memoria. */
const MAINTENANCE_EVERY_IDLE = 4;

/** Evento sul filo verso i client: eventi del loop + approval_request con id. */
export type DaemonEvent =
  | AgentEvent
  | { kind: 'approval_request'; requestId: string; request: ApprovalRequest };

export interface DaemonOptions {
  config: OpenMateConfig;
  secrets?: Secrets;
  /** Override del backend (test/Fake). Default: DirectProviderBackend su Claude. */
  backend?: ReasoningBackend;
  /** Path del file di config, per persistere i cambi di heartbeat dal cruscotto. */
  configPath?: string;
}

/**
 * Il daemon: unico processo con stato. Monta config/llm/memory/tools/core/scheduler
 * ed espone eventi + comandi (vedi docs/01, docs/08). L'HTTP è un wrapper sottile.
 */
export class Daemon {
  readonly memory: Memory;
  readonly tasks: TaskStore;
  readonly loop: CognitiveLoop;
  readonly scheduler: Scheduler;
  private readonly registry: ToolRegistry;
  private readonly audit: SqliteAuditSink;
  private readonly schedules: ScheduleStore;
  private readonly policy: AutonomyPolicy;
  private readonly subscribers = new Set<(event: DaemonEvent) => void>();
  private readonly pendingApprovals = new Map<
    string,
    { resolve: (approved: boolean) => void; request: ApprovalRequest }
  >();
  private currentAbort?: AbortController;
  private paused = false;
  /** Contatore di heartbeat a vuoto, per la cadenza di manutenzione. */
  private idleHeartbeats = 0;
  /** Timer di auto-continuazione (agent.wake_in). */
  private readonly followupTimers = new Set<ReturnType<typeof setTimeout>>();
  private readonly configPath?: string;
  /** Stato del computer-use (per l'overlay). */
  readonly computerUse: { enabled: boolean; reason?: string };
  /** Sessione browser (Playwright), se abilitata. */
  private browser?: BrowserSession;

  constructor(opts: DaemonOptions) {
    const root = opts.config.storage.root;
    const dbPath = join(root, 'openmate.db');
    this.configPath = opts.configPath;

    this.memory = createMemory(root);
    this.tasks = new TaskStore(dbPath);
    this.audit = new SqliteAuditSink(dbPath);
    this.schedules = new ScheduleStore(dbPath);
    this.registry = new ToolRegistry()
      .register(shellRunTool)
      .register(codeRunTool)
      .registerAll(fileTools)
      .registerAll(createMemoryTools(this.memory))
      .registerAll(createProjectTools())
      .registerAll(
        createAgentTools({
          // riferimenti lazy allo scheduler (creato più avanti nel costruttore)
          setHeartbeat: (s) => this.scheduler.setHeartbeat(s * 1000),
          getHeartbeatSeconds: () => Math.round(this.scheduler.getHeartbeatMs() / 1000),
          wakeIn: (s, note) => this.scheduleFollowup(s, note),
        }),
      )
      .registerAll(
        createScheduleTools({
          isValidCron: (expr) => Scheduler.isValidCron(expr),
          create: (input) => this.createSchedule(input),
          list: () => this.listSchedules(),
          cancel: (id) => this.cancelSchedule(id),
        }),
      )
      .registerAll(
        createTaskTools({
          createGoal: (title) => this.tasks.createGoal({ title }),
          addTask: (title, goalId) => this.tasks.createTask({ title, goalId }),
          listTasks: () => this.tasks.listTasks() as TaskInfo[],
          getTask: (id) => this.tasks.getTask(id) as TaskInfo | undefined,
          noteTask: (id, note) => {
            if (!this.tasks.getTask(id)) return false;
            this.tasks.appendNote(id, note);
            return true;
          },
          completeTask: (id) => {
            if (!this.tasks.getTask(id)) return false;
            this.tasks.updateTaskStatus(id, 'done');
            return true;
          },
          blockTask: (id, reason) => {
            if (!this.tasks.getTask(id)) return false;
            if (reason) this.tasks.appendNote(id, `BLOCCATO: ${reason}`);
            this.tasks.updateTaskStatus(id, 'blocked');
            return true;
          },
        }),
      );

    // Computer-use: solo se abilitato in config e supportato dalla piattaforma.
    this.computerUse = { enabled: false };
    if (opts.config.computerUse.enabled) {
      const executor = createExecutor();
      const caps = executor.capabilities();
      this.computerUse = { enabled: caps.supported, reason: caps.reason };
      if (caps.supported) this.registry.registerAll(createComputerTools(executor));
    }

    // Browser (Playwright): sessione autonoma sul Chrome installato, se abilitato.
    if (opts.config.browser.enabled) {
      this.browser = new BrowserSession({
        profileDir: join(root, 'browser-profile'),
        headless: !opts.config.browser.headed,
      });
      this.registry.registerAll(createBrowserTools(this.browser));
    }

    const backend = opts.backend ?? buildBackend(opts.config, opts.secrets);
    this.policy = opts.config.autonomy;
    const budget: Budget = opts.config.budget;

    this.loop = new CognitiveLoop({
      backend,
      registry: this.registry,
      memory: this.memory,
      tasks: this.tasks,
      policy: this.policy,
      budget,
      audit: this.audit,
      requestApproval: (req) => this.requestApproval(req),
      onEvent: (event) => this.emit(event),
    });

    this.scheduler = new Scheduler({
      intervalMs: opts.config.heartbeat.intervalMs,
      cron: opts.config.heartbeat.cron,
      shouldRun: () => {
        if (this.paused) return false;
        if (this.tasks.nextPendingTask() !== undefined) return true;
        // nessun task: ogni N tick a vuoto concedi un ciclo di MANUTENZIONE memoria
        this.idleHeartbeats += 1;
        if (this.idleHeartbeats >= MAINTENANCE_EVERY_IDLE) {
          this.idleHeartbeats = 0;
          return true;
        }
        return false;
      },
      onCycle: async (trigger) => {
        this.currentAbort = new AbortController();
        try {
          await this.loop.runCycle(trigger as Trigger, { signal: this.currentAbort.signal });
        } finally {
          this.currentAbort = undefined;
        }
      },
    });
  }

  onEvent(fn: (event: DaemonEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  private emit(event: DaemonEvent): void {
    for (const fn of this.subscribers) fn(event);
  }

  /** Instrada la richiesta di approvazione al client e attende la decisione. */
  private requestApproval(request: ApprovalRequest): Promise<boolean> {
    return new Promise((resolve) => {
      const requestId = randomUUID();
      // auto-nega se nessuno risponde entro il timeout (non blocca la coda)
      const timer = setTimeout(() => {
        if (this.pendingApprovals.delete(requestId)) resolve(false);
      }, APPROVAL_TIMEOUT_MS);
      this.pendingApprovals.set(requestId, {
        resolve: (approved) => {
          clearTimeout(timer);
          resolve(approved);
        },
        request,
      });
      this.emit({ kind: 'approval_request', requestId, request });
    });
  }

  resolveApproval(requestId: string, approved: boolean, always = false): void {
    const entry = this.pendingApprovals.get(requestId);
    if (!entry) return;
    this.pendingApprovals.delete(requestId);
    if (approved && always) this.addAllowRule(entry.request);
    entry.resolve(approved);
  }

  /** "Consenti sempre questo tipo": aggiunge una regola alla policy (sessione). */
  private addAllowRule(request: ApprovalRequest): void {
    if (request.toolName !== 'shell.run') return;
    const details = request.details as { command?: string };
    const program = details.command?.trim().split(/\s+/)[0];
    if (program && !this.policy.shell.allow.includes(program)) {
      this.policy.shell.allow.push(program);
    }
  }

  /** Kill-switch: annulla il ciclo in corso. */
  interrupt(): void {
    this.currentAbort?.abort();
  }

  /** Dormi: ferma gli heartbeat autonomi. */
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.scheduler.stop();
    this.clearFollowups();
    this.emit({ kind: 'state', state: { status: 'sleeping' } });
  }

  /** Sveglia: riprende gli heartbeat. */
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.scheduler.start();
    this.emit({ kind: 'state', state: { status: 'idle' } });
  }

  async submitUserMessage(content: string): Promise<void> {
    await this.scheduler.submitUserMessage(content);
  }

  /** Programma una auto-continuazione (agent.wake_in): tra N secondi rilancia un
   *  ciclo con la nota come istruzione, bypassando il pre-check. */
  scheduleFollowup(seconds: number, note: string): void {
    const ms = Math.min(3_600_000, Math.max(3000, Math.round(seconds * 1000)));
    const timer = setTimeout(() => {
      this.followupTimers.delete(timer);
      if (!this.paused) void this.submitUserMessage(`[Auto-continuazione] ${note}`);
    }, ms);
    timer.unref?.();
    this.followupTimers.add(timer);
  }

  private clearFollowups(): void {
    for (const t of this.followupTimers) clearTimeout(t);
    this.followupTimers.clear();
  }

  /* ---------------- task ricorrenti (schedule) ---------------- */

  /** Registra il cron di uno schedule: a ogni scatto rilancia l'istruzione. */
  private armSchedule(s: Schedule): void {
    this.scheduler.addCron(s.id, s.cron, () => {
      if (!this.paused) void this.submitUserMessage(`[Task ricorrente: ${s.title}] ${s.instruction}`);
    });
  }

  private toInfo(s: Schedule): ScheduleInfo {
    return { id: s.id, cron: s.cron, title: s.title, instruction: s.instruction, nextRun: this.scheduler.nextRun(s.id) };
  }

  createSchedule(input: { cron: string; instruction: string; title?: string }): ScheduleInfo {
    const s = this.schedules.create(input);
    this.armSchedule(s);
    this.emit({ kind: 'state', state: this.loop.getState() }); // nudge UI
    return this.toInfo(s);
  }

  listSchedules(): ScheduleInfo[] {
    return this.schedules.list().map((s) => this.toInfo(s));
  }

  cancelSchedule(id: string): boolean {
    this.scheduler.removeCron(id);
    return this.schedules.remove(id);
  }

  isValidCron(expr: string): boolean {
    return Scheduler.isValidCron(expr);
  }

  isPaused(): boolean {
    return this.paused;
  }

  /** Ultime voci di audit (per la dashboard). */
  recentLog(n = 50) {
    return this.audit.recent(n);
  }

  heartbeatSeconds(): number {
    return Math.round(this.scheduler.getHeartbeatMs() / 1000);
  }

  /** Cambia il ritmo dell'heartbeat dal cruscotto (runtime + persistito su config). */
  setHeartbeat(seconds: number): void {
    const s = Math.min(1_000_000, Math.max(10, Math.round(seconds)));
    this.scheduler.setHeartbeat(s * 1000);
    if (!this.configPath) return;
    try {
      const cfg = JSON.parse(readFileSync(this.configPath, 'utf8'));
      cfg.heartbeat = { ...(cfg.heartbeat ?? {}), intervalMs: s * 1000 };
      writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf8');
    } catch {
      /* best-effort: la modifica resta comunque a runtime */
    }
  }

  createGoal(title: string): Goal {
    return this.tasks.createGoal({ title });
  }

  createTask(title: string, goalId?: string): Task {
    return this.tasks.createTask({ title, goalId });
  }

  auditCount(): number {
    return this.audit.count();
  }

  start(): void {
    this.scheduler.start();
    for (const s of this.schedules.list()) this.armSchedule(s); // ripristina i task ricorrenti
  }

  stop(): void {
    this.scheduler.stop();
    this.clearFollowups();
    void this.browser?.close();
    for (const [id, entry] of this.pendingApprovals) {
      this.pendingApprovals.delete(id);
      entry.resolve(false);
    }
    this.audit.close();
    this.tasks.close();
    this.schedules.close();
    this.memory.close();
  }
}

function buildBackend(config: OpenMateConfig, secrets?: Secrets): ReasoningBackend {
  const provider = createProvider({
    name: config.provider.name,
    baseURL: config.provider.baseURL,
    apiKey: secrets?.apiKey,
  });
  return new DirectProviderBackend(provider.languageModel(config.provider.model));
}
