import { randomUUID } from 'node:crypto';
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
import { createExecutor } from '@openmate/computer';
import {
  type ApprovalRequest,
  type AutonomyPolicy,
  ToolRegistry,
  createComputerTools,
  createMemoryTools,
  createProjectTools,
  fileTools,
  shellRunTool,
} from '@openmate/tools';
import { SqliteAuditSink } from './audit-sqlite.js';

/** Auto-nega di un'approvazione senza risposta (evita blocchi della coda). */
const APPROVAL_TIMEOUT_MS = 120_000;

/** Evento sul filo verso i client: eventi del loop + approval_request con id. */
export type DaemonEvent =
  | AgentEvent
  | { kind: 'approval_request'; requestId: string; request: ApprovalRequest };

export interface DaemonOptions {
  config: OpenMateConfig;
  secrets?: Secrets;
  /** Override del backend (test/Fake). Default: DirectProviderBackend su Claude. */
  backend?: ReasoningBackend;
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
  private readonly policy: AutonomyPolicy;
  private readonly subscribers = new Set<(event: DaemonEvent) => void>();
  private readonly pendingApprovals = new Map<
    string,
    { resolve: (approved: boolean) => void; request: ApprovalRequest }
  >();
  private currentAbort?: AbortController;
  private paused = false;
  /** Stato del computer-use (per l'overlay). */
  readonly computerUse: { enabled: boolean; reason?: string };

  constructor(opts: DaemonOptions) {
    const root = opts.config.storage.root;
    const dbPath = join(root, 'openmate.db');

    this.memory = createMemory(root);
    this.tasks = new TaskStore(dbPath);
    this.audit = new SqliteAuditSink(dbPath);
    this.registry = new ToolRegistry()
      .register(shellRunTool)
      .registerAll(fileTools)
      .registerAll(createMemoryTools(this.memory))
      .registerAll(createProjectTools());

    // Computer-use: solo se abilitato in config e supportato dalla piattaforma.
    this.computerUse = { enabled: false };
    if (opts.config.computerUse.enabled) {
      const executor = createExecutor();
      const caps = executor.capabilities();
      this.computerUse = { enabled: caps.supported, reason: caps.reason };
      if (caps.supported) this.registry.registerAll(createComputerTools(executor));
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
      shouldRun: () => !this.paused && this.tasks.nextPendingTask() !== undefined,
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
  }

  stop(): void {
    this.scheduler.stop();
    for (const [id, entry] of this.pendingApprovals) {
      this.pendingApprovals.delete(id);
      entry.resolve(false);
    }
    this.audit.close();
    this.tasks.close();
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
