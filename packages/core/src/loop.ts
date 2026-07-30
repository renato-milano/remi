import type { ModelMessage } from 'ai';
import type { Budget, ReasoningBackend, TokenUsage } from '@openmate/llm';
import type { MemorySystem } from '@openmate/memory';
import {
  type ApprovalRequest,
  type AuditSink,
  type AutonomyPolicy,
  InMemoryAuditSink,
  type ToolRegistry,
  createToolContext,
} from '@openmate/tools';
import type { Task, TaskStore } from './task-store.js';
import type { AgentEvent, AgentState, CycleResult, Trigger } from './types.js';

export interface CognitiveLoopOptions {
  backend: ReasoningBackend;
  registry: ToolRegistry;
  memory: MemorySystem;
  tasks: TaskStore;
  policy: AutonomyPolicy;
  budget: Budget;
  requestApproval: (req: ApprovalRequest) => Promise<boolean>;
  audit?: AuditSink;
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Il cognitive cycle: perceive → (retrieve agentico via memory.*) → plan/act
 * (backend + tool) → reflect. Macchina a stati, goal/task e budget.
 * Vedi docs/02, ADR-0002/0009.
 */
export class CognitiveLoop {
  private state: AgentState = { status: 'idle' };
  private readonly audit: AuditSink;

  constructor(private readonly opts: CognitiveLoopOptions) {
    this.audit = opts.audit ?? new InMemoryAuditSink();
  }

  getState(): AgentState {
    return this.state;
  }

  private setState(patch: Partial<AgentState>): void {
    this.state = { ...this.state, ...patch };
    this.opts.onEvent?.({ kind: 'state', state: this.state });
  }

  async runCycle(trigger: Trigger): Promise<CycleResult> {
    // 1. perceive: attiva un task (heartbeat/cron); un messaggio utente non lo richiede
    const task = trigger.kind === 'user_message' ? undefined : this.opts.tasks.nextPendingTask();
    if (task) this.opts.tasks.updateTaskStatus(task.id, 'in_progress');
    this.setState({ status: 'thinking', activeTaskId: task?.id, activeGoalId: task?.goalId });

    const core = this.opts.memory.coreBlocks();
    const system = buildSystem(core.persona, core.user, task);
    const messages: ModelMessage[] = [{ role: 'user', content: userContent(trigger, task) }];

    // 2. tool context: l'approval segna lo stato waiting_approval
    const ctx = createToolContext({
      audit: this.audit,
      requestApproval: async (req) => {
        this.setState({ status: 'waiting_approval' });
        const approved = await this.opts.requestApproval(req);
        this.setState({ status: 'acting' });
        return approved;
      },
    });
    const tools = this.opts.registry.toAiToolSet(ctx, this.opts.policy);

    // 3. plan/act: consuma lo stream del backend (budget applicato dal backend)
    let text = '';
    let actions = 0;
    let usage: TokenUsage = {};
    for await (const ev of this.opts.backend.run({ system, messages, tools, budget: this.opts.budget })) {
      switch (ev.type) {
        case 'text-delta':
          text += ev.text;
          break;
        case 'tool-call':
          actions += 1;
          this.setState({ status: 'acting' });
          this.opts.onEvent?.({ kind: 'action', summary: ev.toolName });
          break;
        case 'tool-result':
          this.setState({ status: 'thinking' });
          break;
        case 'finish':
          usage = ev.usage;
          break;
      }
    }
    const finalText = text.trim();
    if (finalText) this.opts.onEvent?.({ kind: 'message', role: 'agent', content: finalText });

    // 4. reflect: episodic + chiusura del task
    this.opts.memory.log({ kind: 'reflection', actor: 'agent', content: reflection(trigger, actions, finalText) });
    if (task) this.opts.tasks.updateTaskStatus(task.id, 'done');

    this.setState({ status: 'idle', activeTaskId: undefined, activeGoalId: undefined });
    return { taskId: task?.id, actions, text: finalText, usage };
  }
}

function buildSystem(persona: string, user: string, task?: Task): string {
  const base = `Sei OpenMate, un agente personale autonomo.\n\n## Persona\n${persona}\n\n## Utente\n${user}`;
  return task ? `${base}\n\n## Task attivo\n${task.title}` : base;
}

function userContent(trigger: Trigger, task?: Task): string {
  switch (trigger.kind) {
    case 'user_message':
      return trigger.content;
    case 'heartbeat':
      return task
        ? `È il tuo heartbeat. Avanza il task attivo: "${task.title}".`
        : 'È il tuo heartbeat. Nessun task pendente: valuta se fare manutenzione o restare in attesa.';
    case 'cron':
      return task
        ? `Job cron "${trigger.name}". Avanza il task: "${task.title}".`
        : `Job cron "${trigger.name}".`;
  }
}

function reflection(trigger: Trigger, actions: number, text: string): string {
  const head = `Ciclo (${trigger.kind}) completato: ${actions} azioni.`;
  return text ? `${head} Esito: ${text.slice(0, 200)}` : head;
}
