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
  /** Grant di sessione (es. 'computer'): persistono tra i cicli, per l'intera
   *  vita del daemon → il computer-use si approva una volta, non a ogni messaggio. */
  private readonly sessionGrants = new Set<string>();

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

  async runCycle(trigger: Trigger, opts: { signal?: AbortSignal } = {}): Promise<CycleResult> {
    // 1. perceive: attiva un task (heartbeat/cron); un messaggio utente non lo richiede
    const task = trigger.kind === 'user_message' ? undefined : this.opts.tasks.nextPendingTask();
    if (task) this.opts.tasks.updateTaskStatus(task.id, 'in_progress');
    this.setState({ status: 'thinking', activeTaskId: task?.id, activeGoalId: task?.goalId });

    const core = this.opts.memory.coreBlocks();
    const hasComputer = Boolean(this.opts.registry.get('computer.screenshot'));
    const system = buildSystem(core.persona, core.user, task, hasComputer);
    const messages: ModelMessage[] = [{ role: 'user', content: userContent(trigger, task) }];

    // 2. tool context: l'approval segna lo stato waiting_approval; il signal è il kill-switch
    // buffer immagine: i computer.* vi depositano lo screenshot; il backend lo
    // inietta come user message prima del passo successivo (vedi takeImage).
    const imageBuffer: { current?: string } = {};
    const ctx = createToolContext({
      audit: this.audit,
      signal: opts.signal,
      grants: this.sessionGrants, // persistono tra i cicli
      emitImage: (b64) => {
        imageBuffer.current = b64;
      },
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
    let interrupted = false;
    let errorMsg;
    try {
      for await (const ev of this.opts.backend.run({
        system,
        messages,
        tools,
        budget: this.opts.budget,
        signal: opts.signal,
        takeImage: () => {
          const v = imageBuffer.current;
          imageBuffer.current = undefined;
          return v;
        },
      })) {
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
    } catch (err) {
      if (opts.signal?.aborted) interrupted = true;
      else errorMsg = err instanceof Error ? err.message : String(err);
    }
    if (opts.signal?.aborted) interrupted = true;

    const finalText = text.trim();

    // 4. reflect — l'errore viene comunicato all'utente, non fa crashare
    if (interrupted) {
      this.opts.memory.log({ kind: 'reflection', actor: 'agent', content: "Ciclo interrotto dall'utente." });
      if (task) this.opts.tasks.updateTaskStatus(task.id, 'pending'); // ritentabile
    } else if (errorMsg) {
      const short = errorMsg.length > 260 ? `${errorMsg.slice(0, 260)}…` : errorMsg;
      this.opts.onEvent?.({ kind: 'message', role: 'agent', content: `Ho avuto un problema col modello. ${short}` });
      this.opts.memory.log({ kind: 'reflection', actor: 'agent', content: `Errore nel ciclo: ${errorMsg}` });
      if (task) this.opts.tasks.updateTaskStatus(task.id, 'blocked');
    } else {
      if (finalText) this.opts.onEvent?.({ kind: 'message', role: 'agent', content: finalText });
      this.opts.memory.log({ kind: 'reflection', actor: 'agent', content: reflection(trigger, actions, finalText) });
      if (task) this.opts.tasks.updateTaskStatus(task.id, 'done');
    }

    this.setState({ status: 'idle', activeTaskId: undefined, activeGoalId: undefined });
    return { taskId: task?.id, actions, text: finalText, usage };
  }
}

const STYLE =
  'Rispondi in modo BREVE e naturale, come in una chat con un amico: di norma 1-2 frasi. ' +
  'Vai dritto al punto, niente elenchi lunghi o preamboli. Approfondisci solo se te lo chiede.';

const COMPUTER_GUIDE = `## Controllo del computer (vision)
Puoi VEDERE e USARE lo schermo con i tool computer.*. Ogni azione ti restituisce un nuovo screenshot: guardalo davvero prima di decidere la mossa successiva.

Regole:
- Le coordinate (x,y) sono nei PIXEL dell'ultimo screenshot. Non inventarle: individua l'elemento nell'immagine. Se non vedi bene, dillo invece di cliccare a caso.
- Lavora a piccoli passi: screenshot per vedere → una azione → verifica sul nuovo screenshot che sia andata come previsto; solo allora prosegui.
- PREFERISCI i deep-link/URL invece dei click, sono molto più affidabili. Esempi (macOS, shell.run):
  · Spotify: open "spotify:search:NOME CANZONE" (apre l'app E cerca in un colpo solo)
  · Sito/ricerca web: open "https://www.google.com/search?q=..." oppure open -a "Google Chrome" "https://..."
  · Aprire un'app: open -a "NomeApp"
- Dopo aver aperto un'app aspetta che sia PRONTA: fai uno screenshot e controlla che sia caricata prima di interagire (appena aperta non ha ancora il focus).
- Per cercare dentro un'app senza deep-link: (1) metti a fuoco il campo di ricerca cliccandolo, (2) computer.type("query"), (3) computer.key(["enter"]) per confermare. NON dimenticare Invio.
- Non mischiare tentativi a caso di shell/curl con i click. Scegli una strategia e portala a termine.
- Vai avanti finché l'obiettivo è DAVVERO raggiunto (il risultato è visibile nello screenshot). Non fermarti a metà; ma non ripetere all'infinito la stessa azione che non funziona: cambia approccio o chiedi.`;

function buildSystem(persona: string, user: string, task?: Task, computerUse = false): string {
  let base = `Sei un agente personale autonomo che vive sul dispositivo dell'utente.\n\n## Persona\n${persona}\n\n## Utente\n${user}\n\n## Stile\n${STYLE}`;
  if (computerUse) base += `\n\n${COMPUTER_GUIDE}`;
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
