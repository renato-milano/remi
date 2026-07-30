import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { OpenMateConfig, Secrets } from '@openmate/config';
import {
  type Budget,
  DirectProviderBackend,
  type ReasoningBackend,
  createAnthropicProvider,
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
import {
  type ApprovalRequest,
  type AutonomyPolicy,
  ToolRegistry,
  createMemoryTools,
  fileTools,
  shellRunTool,
} from '@openmate/tools';
import { SqliteAuditSink } from './audit-sqlite.js';

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
  private readonly subscribers = new Set<(event: DaemonEvent) => void>();
  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();

  constructor(opts: DaemonOptions) {
    const root = opts.config.storage.root;
    const dbPath = join(root, 'openmate.db');

    this.memory = createMemory(root);
    this.tasks = new TaskStore(dbPath);
    this.audit = new SqliteAuditSink(dbPath);
    this.registry = new ToolRegistry()
      .register(shellRunTool)
      .registerAll(fileTools)
      .registerAll(createMemoryTools(this.memory));

    const backend = opts.backend ?? buildBackend(opts.config, opts.secrets);
    const policy: AutonomyPolicy = opts.config.autonomy;
    const budget: Budget = opts.config.budget;

    this.loop = new CognitiveLoop({
      backend,
      registry: this.registry,
      memory: this.memory,
      tasks: this.tasks,
      policy,
      budget,
      audit: this.audit,
      requestApproval: (req) => this.requestApproval(req),
      onEvent: (event) => this.emit(event),
    });

    this.scheduler = new Scheduler({
      intervalMs: opts.config.heartbeat.intervalMs,
      cron: opts.config.heartbeat.cron,
      shouldRun: () => this.tasks.nextPendingTask() !== undefined,
      onCycle: async (trigger) => {
        await this.loop.runCycle(trigger as Trigger);
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
      this.pendingApprovals.set(requestId, resolve);
      this.emit({ kind: 'approval_request', requestId, request });
    });
  }

  resolveApproval(requestId: string, approved: boolean): void {
    const resolve = this.pendingApprovals.get(requestId);
    if (resolve) {
      this.pendingApprovals.delete(requestId);
      resolve(approved);
    }
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
    for (const [id, resolve] of this.pendingApprovals) {
      this.pendingApprovals.delete(id);
      resolve(false);
    }
    this.audit.close();
    this.tasks.close();
    this.memory.close();
  }
}

function buildBackend(config: OpenMateConfig, secrets?: Secrets): ReasoningBackend {
  const provider = createAnthropicProvider({
    apiKey: secrets?.apiKey,
    baseURL: config.provider.baseURL,
  });
  return new DirectProviderBackend(provider.languageModel(config.provider.model));
}
