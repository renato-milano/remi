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
  /** Buffer di conversazione (memoria a breve termine della chat): ultimi turni
   *  user/assistant inclusi nel contesto del modello, così ricorda cosa ci si è detti. */
  private readonly history: ModelMessage[] = [];

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
    if (task) {
      this.opts.tasks.incrementAttempts(task.id);
      this.opts.tasks.updateTaskStatus(task.id, 'in_progress');
    }
    this.setState({ status: 'thinking', activeTaskId: task?.id, activeGoalId: task?.goalId });

    const core = this.opts.memory.coreBlocks();
    const hasComputer = Boolean(this.opts.registry.get('computer.screenshot'));
    const hasBrowser = Boolean(this.opts.registry.get('browser.open'));
    const system = buildSystem(core.persona, core.user, task, { computer: hasComputer, browser: hasBrowser });
    // memoria a breve termine della chat: includiamo gli ultimi turni della
    // conversazione, così l'agente RICORDA cosa ci si è appena detti.
    const userText = userContent(trigger, task);
    const messages: ModelMessage[] = [...this.history, { role: 'user', content: userText }];

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
    // Risposte INCREMENTALI: il testo prodotto prima di ogni azione viene emesso
    // subito come messaggio (l'agente "parla mentre agisce"), non accumulato.
    let text = ''; // accumulo completo (per reflection/memoria)
    let pending = ''; // segmento del passo corrente, non ancora emesso
    let actions = 0;
    let usage: TokenUsage = {};
    let interrupted = false;
    let errorMsg;
    const flush = () => {
      const seg = pending.trim();
      pending = '';
      if (seg) this.opts.onEvent?.({ kind: 'message', role: 'agent', content: seg });
      return seg;
    };
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
            pending += ev.text;
            text += ev.text;
            break;
          case 'tool-call':
            flush(); // emetti la narrazione prima di agire
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
    const lastSegment = pending.trim(); // ultimo segmento, emesso sotto se il ciclo va a buon fine

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
      // emette solo l'ultimo segmento: quelli precedenti sono già stati inviati durante il ciclo
      if (lastSegment) this.opts.onEvent?.({ kind: 'message', role: 'agent', content: lastSegment });
      this.opts.memory.log({ kind: 'reflection', actor: 'agent', content: reflection(trigger, actions, finalText) });
      // NON marcare "done" da soli: il task lo chiude l'agente (task.complete). Se
      // è ancora in corso, lo si riprende al prossimo heartbeat; troppi tentativi → blocked.
      if (task) {
        const cur = this.opts.tasks.getTask(task.id);
        if (cur && cur.status === 'in_progress') {
          this.opts.tasks.updateTaskStatus(task.id, cur.attempts >= MAX_TASK_ATTEMPTS ? 'blocked' : 'pending');
        }
      }
    }

    // aggiorna il buffer di conversazione (solo turni riusciti; niente
    // pollution da heartbeat interni). Trim agli ultimi MAX_HISTORY messaggi.
    if (!interrupted && !errorMsg) {
      if (trigger.kind === 'user_message') {
        this.history.push({ role: 'user', content: userText });
        if (finalText) this.history.push({ role: 'assistant', content: finalText });
      } else if (finalText) {
        // heartbeat/cron che produce un messaggio proattivo: resta nel dialogo
        this.history.push({ role: 'assistant', content: finalText });
      }
      if (this.history.length > MAX_HISTORY) {
        this.history.splice(0, this.history.length - MAX_HISTORY);
      }
    }

    this.setState({ status: 'idle', activeTaskId: undefined, activeGoalId: undefined });
    return { taskId: task?.id, actions, text: finalText, usage };
  }
}

/** Messaggi max nel buffer di conversazione (~12 turni). Limita i token. */
const MAX_HISTORY = 24;
/** Dopo N cicli senza completarlo, un task va in 'blocked' (anti-loop). */
const MAX_TASK_ATTEMPTS = 8;

const STYLE =
  'Rispondi in modo BREVE e naturale, come in una chat con un amico: di norma 1-2 frasi. ' +
  'Vai dritto al punto, niente elenchi lunghi o preamboli. Approfondisci solo se te lo chiede.';

const COMPUTER_GUIDE = `## Controllo del computer (vision)
Puoi VEDERE e USARE lo schermo con i tool computer.*. Ogni azione ti restituisce un nuovo screenshot: guardalo davvero prima di decidere la mossa successiva.

GUARDARE È GRATIS: computer.screenshot (e computer.list_elements) NON richiedono permesso — sono solo osservazione. Chiedi il permesso SOLO per AGIRE (click, type, tasti, scroll).

Chiediti sempre se la richiesta dell'utente richiede di vedere lo schermo: frasi come "cosa vedi?", "cosa c'è sullo schermo?", "aiutami con questo", "che errore è?", "leggi questa pagina", "questo", "qui", riferimenti a ciò che ha davanti → fai SUBITO computer.screenshot (senza chiedere) e rispondi in base a ciò che vedi. Se non serve guardare (una domanda generica), non farlo.

Regole:
- Le coordinate (x,y) sono nei PIXEL dell'ultimo screenshot. Non inventarle: individua l'elemento nell'immagine. Se non vedi bene, dillo invece di cliccare a caso.
- Lavora a piccoli passi: screenshot per vedere → una azione → verifica sul nuovo screenshot che sia andata come previsto; solo allora prosegui.
- PREFERISCI i deep-link/URL invece dei click quando esistono: sono molto più affidabili. Molte app espongono uno schema URI (es. "app:azione:parametro") che apre l'app ED esegue l'azione in un colpo solo; i siti hanno URL di ricerca diretti. Su macOS: per un URI/URL usa shell.run open "<url o uri>" (SENZA -a); per aprire un'app per nome usa open -a "NomeApp".
- Dopo aver aperto un'app NON agire subito: non è ancora pronta né a fuoco. Usa computer.wait(2-3) e guarda lo screenshot che restituisce; ripeti l'attesa finché è caricata, poi interagisci.
- Per CLICCARE un pulsante o un campo, PREFERISCI computer.list_elements (ti dà la lista numerata degli elementi con etichetta) e poi computer.click_element(indice): è preciso. Usa il click a coordinate (computer.click) solo se l'elemento non compare nella lista.
- Per cercare dentro un'app senza deep-link: (1) attendi che sia pronta, (2) metti a fuoco il campo di ricerca (list_elements + click_element, o un click), (3) computer.type("query"), (4) computer.key(["enter"]). NON dimenticare Invio, e verifica con uno screenshot che la ricerca sia partita.
- Non mischiare tentativi a caso di shell/curl con i click. Scegli una strategia e portala a termine.
- Vai avanti finché l'obiettivo è DAVVERO raggiunto (il risultato è visibile nello screenshot). Non fermarti a metà; ma non ripetere all'infinito la stessa azione che non funziona: cambia approccio o chiedi.`;

const PROJECT_GUIDE = `## Memoria di progetto (.remi)
Ogni cartella può essere un "progetto" con una memoria persistente in .remi/project.md. Quando inizi a lavorare in una cartella (o l'utente te ne indica una), usa project.remember({path}) per caricarne — o crearne — il contesto.
- Alla PRIMA visita (sezioni "da compilare"), riempi "Cos'è" e "A cosa serve" con project.update({path, section, content}); aggiorna le sezioni quando cambiano.
- Usa project.record({path, note}) SOLO per eventi/azioni (vanno nel Registro), non per la descrizione stabile.
- Se vuoi riorganizzare tutto liberamente, usa project.write({path, content}).
Consulta questa memoria prima di agire in una cartella già vista.`;

const WIKI_GUIDE = `## Cartelle e luoghi conosciuti (wiki)
Hai una wiki di memoria durevole (memory.write / memory.search / memory.read) che persiste tra le sessioni. Usala per non dover richiedere ogni volta dove sono le cose.
- Quando l'utente ti fa lavorare in una cartella importante o ricorrente (un cliente, un progetto, un archivio), SALVALA nella wiki con memory.write: name breve (es. "cliente-acme"), type "cartella", description con il nome e il PATH assoluto, body con a cosa serve e quando usarla. Così domani non dovrai richiedere il percorso.
- PRIMA di chiedere all'utente dove si trova una cartella o un progetto già citato in passato, cerca nella wiki con memory.search (per nome, cliente o parola chiave): se trovi il path, usalo direttamente.
- Aggiorna la nota (stesso name) se il path o l'uso cambiano.`;

const AUTONOMY_GUIDE = `## Autonomia (sii proattivo ed efficiente)
- OBIETTIVI A LUNGO RAGGIO: se l'utente chiede un lavoro grande o che richiede più sessioni, NON provare a finirlo tutto in un colpo. Crea un task persistente con task.add({title}) (o goal.create per un obiettivo ampio con più task): verrà ripreso da solo a ogni heartbeat. A ogni ripresa: leggi i progressi, fai un passo avanti, annota con task.note({id, note}) DOVE sei arrivato, e quando l'obiettivo è DAVVERO raggiunto chiudilo con task.complete({id}) (finché non lo fai, continuerai a riprenderlo). Se sei bloccato (serve l'utente o manca qualcosa) usa task.block({id, reason}).
- Task lunghi entro la sessione: usa agent.wake_in({seconds, note}) per riprendere presto senza aspettare il prossimo heartbeat. Regola il ritmo con agent.set_heartbeat({seconds}): più veloce mentre lavori attivamente, più lento quando sei in attesa.
- Puoi scrivere ed ESEGUIRE codice con code.run({language:'python'|'node'|'bash', code}): usalo per calcoli, elaborazione dati, automazioni e logica non banale, invece di comandi shell fragili. Riceverai stdout/stderr e il codice di uscita.
- Task RICORRENTI: se l'utente chiede qualcosa di periodico ("ogni giorno alle 17…", "ogni lunedì…", "ogni ora…"), riconoscilo e crea un task con schedule.create({cron, instruction, title}), traducendo l'orario in cron a 5 campi (es. "0 17 * * *" = ogni giorno alle 17:00; "0 * * * *" = ogni ora). L'istruzione dev'essere completa e autosufficiente (verrà eseguita da sola a ogni scatto). Conferma all'utente cosa hai programmato. Usa schedule.list per vedere i task attivi e schedule.cancel({id}) quando l'utente chiede di smettere.`;

const BROWSER_GUIDE = `## Browser (web)
Puoi navigare il web con i tool browser.*. È il modo PREFERITO per compiti web (cercare, leggere, compilare form): è strutturato e affidabile, non serve "vedere" pixel.
- browser.open({url}): apre un URL, un dominio o testo libero (→ ricerca Google). Restituisce titolo, una lista di elementi interattivi con un "ref", e un estratto di testo.
- Per agire scegli l'elemento dalla lista e usa il suo ref: browser.click({ref}) o browser.type({ref, text, submit:true}) (submit preme Invio, per cercare/inviare).
- browser.read() per il testo completo della pagina; browser.snapshot() per rileggere lo stato; browser.back() per tornare indietro.
- Lavora a piccoli passi: dopo un'azione guarda il nuovo snapshot e prosegui. Guardare/leggere è gratis; la prima azione (clic/scrittura) chiede una conferma, poi scorre.`;

function buildSystem(
  persona: string,
  user: string,
  task?: Task,
  caps: { computer?: boolean; browser?: boolean } = {},
): string {
  let base = `Sei un agente personale autonomo che vive sul dispositivo dell'utente.\n\n## Persona\n${persona}\n\n## Utente\n${user}\n\n## Stile\n${STYLE}\n\n${AUTONOMY_GUIDE}\n\n${PROJECT_GUIDE}\n\n${WIKI_GUIDE}`;
  if (caps.browser) base += `\n\n${BROWSER_GUIDE}`;
  if (caps.computer) base += `\n\n${COMPUTER_GUIDE}`;
  return task ? `${base}\n\n## Task attivo\n${task.title}` : base;
}

function userContent(trigger: Trigger, task?: Task): string {
  switch (trigger.kind) {
    case 'user_message':
      return trigger.content;
    case 'heartbeat':
      return task ? advanceTaskPrompt(task) : MAINTENANCE_PROMPT;
    case 'cron':
      return task ? `Job cron "${trigger.name}". ${advanceTaskPrompt(task)}` : `Job cron "${trigger.name}".`;
  }
}

/** Prompt per far avanzare un task persistente su più cicli. */
function advanceTaskPrompt(task: Task): string {
  const progress = task.notes ? `\n\nProgressi finora:\n${task.notes}` : '\n\n(nessun progresso ancora annotato)';
  return (
    `È il tuo heartbeat. Avanza il task: "${task.title}" (id: ${task.id}, tentativo ${task.attempts}).${progress}\n\n` +
    'Fai UN passo avanti concreto, poi annota dove sei arrivato con task.note({id, note}). ' +
    "Se l'obiettivo è COMPLETATO, chiudilo con task.complete({id}). Se sei bloccato, usa task.block({id, reason})."
  );
}

const MAINTENANCE_PROMPT =
  'È il tuo heartbeat e non ci sono task da avanzare: è un buon momento per la MANUTENZIONE della memoria. ' +
  'Rivedi la memoria episodica recente (memory.search) e consolida ciò che è importante e durevole nella wiki (memory.write) ' +
  "o nel profilo utente (memory.core.edit): fatti dell'utente, cartelle/clienti, decisioni. Se non c'è nulla di utile da consolidare, " +
  'rispondi in una riga che è tutto in ordine, senza fare altro.';

function reflection(trigger: Trigger, actions: number, text: string): string {
  const head = `Ciclo (${trigger.kind}) completato: ${actions} azioni.`;
  return text ? `${head} Esito: ${text.slice(0, 200)}` : head;
}
