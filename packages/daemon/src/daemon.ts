import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { OpenMateConfig, Secrets } from '@openmate/config';
import {
  type Budget,
  DirectProviderBackend,
  type ReasoningBackend,
  createProvider,
  makeSubscriptionTokenProvider,
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
import { BrowserSession, ExtensionEngine } from '@openmate/browser';
import { createExecutor, markPath, markPoint } from '@openmate/computer';
import type { WebSocket as WsSocket } from 'ws';
import {
  type ApprovalRequest,
  type AutonomyPolicy,
  ToolRegistry,
  codeRunTool,
  createAgentTools,
  createBrowserTools,
  createComputerTools,
  createMemoryTools,
  createOverlayTools,
  NORMALIZED,
  createProjectTools,
  createScheduleTools,
  createTaskTools,
  type OverlayItem,
  type ScheduleInfo,
  type ScreenFrame,
  type TaskInfo,
  fileTools,
  shellRunTool,
} from '@openmate/tools';
import { SqliteAuditSink } from './audit-sqlite.js';
import { VoiceService, type VoiceStatus } from './voice-service.js';
import { type Schedule, ScheduleStore } from './schedule-store.js';

/** Auto-nega di un'approvazione senza risposta (evita blocchi della coda). */
const APPROVAL_TIMEOUT_MS = 120_000;
/** Ogni quanti heartbeat "a vuoto" concedere un ciclo di manutenzione memoria. */
const MAINTENANCE_EVERY_IDLE = 4;

/** Evento sul filo verso i client: eventi del loop + approval_request con id. */
export type DaemonEvent =
  | AgentEvent
  | { kind: 'approval_request'; requestId: string; request: ApprovalRequest }
  | { kind: 'overlay'; op: 'draw'; items: OverlayItem[]; clear: boolean }
  | { kind: 'overlay'; op: 'clear' }
  | { kind: 'voice'; status: VoiceStatus };

/**
 * "Indica e chiedi": l'utente preme la hotkey puntando qualcosa (o, tenendola
 * premuta, circoscrive un'area col mouse). L'UI cattura il monitor sotto il
 * cursore e lo manda col testo. Coordinate in pixel di `image`; `frame` =
 * rettangolo del monitor in coordinate logiche globali.
 */
export interface PointMessage {
  content: string;
  image: string;
  cursor: { x: number; y: number };
  /** Tracciato dell'area circoscritta (se l'utente ha disegnato invece di puntare). */
  path?: { x: number; y: number }[];
  /** La zona è un'intera finestra (tasto tenuto senza muovere il mouse): di quale app. */
  target?: { app?: string; title?: string };
  /** Ingrandimento della zona indicata (facoltativo); col cursore in `zoomCursor` se è un punto. */
  zoom?: string;
  zoomCursor?: { x: number; y: number };
  frame: { x: number; y: number; w: number; h: number };
}

export interface DaemonOptions {
  config: OpenMateConfig;
  secrets?: Secrets;
  /** Override del backend (test/Fake). Default: DirectProviderBackend su Claude. */
  backend?: ReasoningBackend;
  /** Binario whisper-server per la trascrizione locale (passato dall'app). */
  whisperBin?: string;
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
  /** Coordinate normalizzate 0-1000 per indicatori e pannello (modelli Gemini). */
  private readonly normalized: boolean;
  /** Quando c'è stato l'ultimo turno "indica" (per riconoscere i seguiti). */
  private lastPointAt = 0;
  /** Voce: trascrizione e sintesi vocale. */
  readonly voice: VoiceService;
  /** Il modello vede le immagini? Senza vision "indica e chiedi" manda solo il testo. */
  readonly vision: boolean;
  /** Geometria dell'ultima immagine dello schermo vista dal modello (per overlay.*). */
  private screenFrame?: ScreenFrame;
  /** Sessione browser (Playwright), se abilitata in modalità 'auto'. */
  private browser?: BrowserSession;
  /** Relay verso l'estensione Chrome (modalità 'extension'). */
  private extSocket?: WsSocket;
  private extSeq = 0;
  private readonly extPending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();

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
      if (caps.supported) {
        this.registry.registerAll(
          createComputerTools(executor, {
            // computer.* cattura il monitor principale (origine 0,0)
            onShot: (shot) => {
              this.screenFrame = {
                imageW: shot.width,
                imageH: shot.height,
                x: 0,
                y: 0,
                w: shot.logicalW ?? shot.width,
                h: shot.logicalH ?? shot.height,
              };
            },
          }),
        );
      }
    }

    // Overlay: l'agente disegna indicazioni sullo schermo (solo visualizzazione).
    // I Gemini localizzano bene in 0-1000 e male in pixel (misurato: ~2 px contro ~300 px).
    this.normalized = usesNormalizedCoords(opts.config.provider.model);
    this.registry.registerAll(
      createOverlayTools({
        normalized: this.normalized,
        frame: () => this.screenFrame,
        draw: (items, clear) => this.emit({ kind: 'overlay', op: 'draw', items, clear }),
        clear: () => this.emit({ kind: 'overlay', op: 'clear' }),
      }),
    );

    // Browser: 'extension' pilota il Chrome LIVE via l'estensione; 'auto' lancia
    // una sessione Playwright autonoma sul Chrome installato.
    if (opts.config.browser.enabled) {
      if (opts.config.browser.mode === 'extension') {
        const engine = new ExtensionEngine((op, args) => this.extSendRpc(op, args));
        this.registry.registerAll(createBrowserTools(engine));
      } else {
        this.browser = new BrowserSession({
          profileDir: join(root, 'browser-profile'),
          headless: !opts.config.browser.headed,
        });
        this.registry.registerAll(createBrowserTools(this.browser));
      }
    }

    const built = opts.backend ? { backend: opts.backend, vision: true } : buildBackend(opts.config, opts.secrets);
    const backend = built.backend;
    this.vision = built.vision;

    this.voice = new VoiceService(opts.config, {
      apiKey: opts.secrets?.apiKey,
      whisperBin: opts.whisperBin,
      onStatus: (status) => this.emit({ kind: 'voice', status }),
    });
    void this.voice.ensureModel();
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

  /** "Indica e chiedi": messaggio con lo screenshot del punto indicato dall'utente. */
  async submitPointMessage(msg: PointMessage): Promise<void> {
    const question = msg.content.trim() || "Cos'è questo?";
    if (!this.vision) {
      await this.scheduler.submitUserMessage(
        `${question}\n\n(L'utente sta indicando qualcosa sullo schermo, ma il modello attuale non vede le immagini: ` +
          'diglielo in breve e suggerisci di scegliere un modello con vision nelle Impostazioni.)',
      );
      return;
    }
    const size = pngSize(msg.image);
    if (!size) throw new Error('screenshot non valido (atteso PNG)');
    this.screenFrame = { imageW: size.w, imageH: size.h, ...msg.frame };
    const t0 = Date.now();
    const area = msg.path && msg.path.length > 2 ? msg.path : undefined;
    const images = [
      area
        ? { data: await markPath(msg.image, area), label: 'Schermo (contorno rosso = la zona che ho indicato col mouse):' }
        : { data: await markPoint(msg.image, msg.cursor.x, msg.cursor.y), label: 'Schermo (cerchio rosso = puntatore):' },
    ];
    if (msg.zoom) {
      images.push({
        data: msg.zoomCursor ? await markPoint(msg.zoom, msg.zoomCursor.x, msg.zoomCursor.y) : msg.zoom,
        label: 'Ingrandimento della zona indicata (solo per leggere i dettagli, NON usarne le coordinate):',
      });
    }
    if (process.env.OPENMATE_UI_DEBUG) console.log(`[tempi daemon] marcatura immagini ${Date.now() - t0} ms`);
    // poco dopo un altro turno "indica" la domanda può esserne il seguito ("dimmi di più")
    const now = Date.now();
    const followUp = now - this.lastPointAt < FOLLOW_UP_MS;
    this.lastPointAt = now;
    // nel prompt cursore e zona nelle stesse coordinate in cui il modello risponde
    const toModel = (p: { x: number; y: number }) =>
      this.normalized ? { x: (p.x / size.w) * NORMALIZED, y: (p.y / size.h) * NORMALIZED } : p;
    const prompt = pointPrompt(question, toModel(msg.cursor), area?.map(toModel), this.normalized, followUp, msg.target);
    const what = msg.target ? `la finestra${msg.target.app ? ` di ${msg.target.app}` : ''}` : area ? 'una zona' : 'un punto';
    const historyText = `${question} [indicando ${what} sullo schermo]`;
    await this.scheduler.submitUserMessage(prompt, { images, fast: true, historyText });
  }

  /* ---------------- relay estensione Chrome (browser mode 'extension') ---------------- */

  /** Registra la connessione WebSocket dell'estensione (una scheda alla volta). */
  attachExtensionSocket(socket: WsSocket): void {
    this.extSocket = socket;
    socket.on('message', (data: Buffer) => {
      let m: { id?: number; result?: unknown; error?: string };
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (typeof m.id !== 'number') return;
      const p = this.extPending.get(m.id);
      if (!p) return;
      this.extPending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error));
      else p.resolve(m.result);
    });
    socket.on('close', () => {
      if (this.extSocket === socket) this.extSocket = undefined;
    });
  }

  private extSendRpc(op: string, args?: Record<string, unknown>): Promise<unknown> {
    const socket = this.extSocket;
    if (!socket || socket.readyState !== 1) {
      return Promise.reject(
        new Error(
          "L'estensione OpenMate non è connessa. Apri Chrome, vai sulla scheda e clicca l'icona dell'estensione per collegarla.",
        ),
      );
    }
    const id = ++this.extSeq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.extPending.delete(id);
        reject(new Error('timeout: nessuna risposta dall’estensione'));
      }, 30_000);
      this.extPending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, op, args: args ?? {} }));
    });
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
    this.voice.stop();
    this.audit.close();
    this.tasks.close();
    this.schedules.close();
    this.memory.close();
  }
}

/** Modelli noti senza vision (via gateway OpenAI-compatible). */
const BLIND_MODELS = /deepseek/i;

/** Dimensioni di un PNG in base64, lette dall'header IHDR (senza decodificarlo). */
function pngSize(b64: string): { w: number; h: number } | undefined {
  const head = Buffer.from(b64.slice(0, 64), 'base64');
  if (head.length < 24 || head.readUInt32BE(12) !== 0x49484452) return undefined; // 'IHDR'
  return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
}

/** Testo del turno "indica e chiedi": la domanda + come usare l'immagine e l'overlay. */
/** Entro quanto una nuova domanda "indica" è il seguito della precedente. */
const FOLLOW_UP_MS = 5 * 60_000;

/** Modelli che localizzano meglio con coordinate normalizzate 0-1000 (Gemini). */
export function usesNormalizedCoords(model: string): boolean {
  return /gemini/i.test(model);
}

function pointPrompt(
  question: string,
  cursor: { x: number; y: number },
  area?: { x: number; y: number }[],
  normalized = false,
  followUp = false,
  target?: { app?: string; title?: string },
): string {
  const coords = normalized
    ? "coordinate normalizzate 0-1000 dello screenshot (x da sinistra, y dall'alto)"
    : 'pixel dello screenshot intero';
  let where: string;
  if (area) {
    const xs = area.map((p) => p.x);
    const ys = area.map((p) => p.y);
    const [x0, y0] = [Math.round(Math.min(...xs)), Math.round(Math.min(...ys))];
    const [x1, y1] = [Math.round(Math.max(...xs)), Math.round(Math.max(...ys))];
    where = target
      ? `Ho indicato tutta la finestra${target.app ? ` di ${target.app}` : ''}${target.title ? ` («${target.title}»)` : ''} ` +
        `(contorno rosso nello screenshot, circa x=${x0}..${x1}, y=${y0}..${y1} in ${coords}). ` +
        '"Questo", "qui" si riferiscono a ciò che c\'è in quella finestra.'
      : `Ho indicato una zona passandoci sopra col mouse (contorno rosso nello screenshot, circa x=${x0}..${x1}, y=${y0}..${y1} in ${coords}). ` +
        '"Questo", "qui", "questa parte" si riferiscono al contenuto di quella zona.';
  } else {
    where =
      `Ho premuto il tasto "indica" puntando il mouse: il puntatore è a x=${Math.round(cursor.x)}, y=${Math.round(cursor.y)} ` +
      `(${coords}, cerchio rosso). "Questo", "qui", "quello" si riferiscono a ciò che sta sotto o vicino al puntatore.`;
  }
  // seguito della conversazione: riprendi da quanto già spiegato invece di ripartire da zero
  const cont = followUp
    ? 'Questa domanda può continuare la conversazione appena avuta: se si riferisce a quanto hai già spiegato ' +
      '("dimmi di più", "e questo?", "approfondisci", "non ho capito"), riprendi da lì senza ripetere; ' +
      'se chiede più dettagli, apri un NUOVO pannello più approfondito su quella parte. Se invece chiede altro, rispondi a quello. '
    : '';
  return (
    `${question}\n\n[${where} ${cont}Scegli TU la forma più utile per rispondere:\n` +
    `- EVIDENZIARE lo schermo: per riconoscere, indicare o nominare cose (cos'è, dov'è, quali sono le parti). ` +
    'Chiama overlay.draw con indicatori, riquadri, etichette sulle parti che nomini ' +
    `(coordinate in ${coords}) e metti la risposta (1-3 frasi) nel suo campo answer.\n` +
    '- APRIRE UN PANNELLO disegnato: quando serve spiegare un meccanismo, un processo, un concetto, un perché, ' +
    "o quando l'utente vuole capire meglio o più nel dettaglio (vedi sotto).\n" +
    '- Solo testo (1-3 frasi) se non serve disegnare nulla.\n' +
    `Se ti chiedo di fare qualcosa, usa gli strumenti adatti.]\n\n${PANEL_GUIDE}`
  );
}

/**
 * Formato del pannello di spiegazione: scritto nel testo, così arriva in streaming
 * e ogni passo si disegna (e si legge) mentre il modello scrive il successivo.
 */
const PANEL_GUIDE = `[PANNELLO — una spiegazione disegnata a mano che si costruisce mentre parli, come alla lavagna.
Scrivi SOLO questo, senza altro testo né blocchi di codice:
<panel title="titolo breve">
<step><say>una o due frasi dette ad alta voce (max 35 parole)</say>
<svg>elementi SVG di QUESTO passo</svg></step>
…altri passi…
</panel>
Regole:
- Spiega DAVVERO, come un buon insegnante alla lavagna: qui la brevità delle altre risposte non vale. Il numero di passi segue l'argomento, non una regola fissa: un'idea semplice 2-3 passi, un meccanismo o un processo 4-6, un argomento ricco o una richiesta di approfondire 6-8. Non aggiungere passi di riempimento e non tagliare quelli che servono a capire.
- Ogni passo AGGIUNGE elementi allo STESSO disegno: costruisci un unico schema che cresce, non disegni separati.
- Area di disegno larga 600 (origine in alto a sinistra), alta 380, fino a 560 se i passi sono tanti. Lascia margini di 20. Il testo dentro l'svg è in italiano, font-size 15-22.
- Disegna davvero il concetto, con una forma adatta a ciò che spieghi: diagrammi di flusso, sezioni di oggetti, assi e curve, cicli, confronti, linee del tempo, schemi di forze… Evita di ripetere sempre la stessa disposizione a riquadri.
- Elementi ammessi: path, line, polyline, polygon, rect, circle, ellipse, text, g. SVG SNELLO: non scrivere stroke, stroke-width, font-family né fill="none" (sono già i valori predefiniti: tratto scuro, nessun riempimento). Per colorare usa SOLO class: b (blu), r (rosso), v (verde), g (giallo), k (grigio) sulle forme = riempimento pastello e bordo colorato; sui testi e sulle linee = colore di accento. Frecce: class="a" su path/line. Esempio: <rect class="b" x="40" y="60" width="140" height="50" rx="8"/><text class="r" x="110" y="90">Turbina</text>
- Ogni passo con gli elementi che servono (di solito 4-14), ordinati come li disegneresti: prima le forme, poi le frecce, poi le scritte. Usa dettagli veri del concetto (nomi delle parti, valori, direzioni, relazioni), non segnaposto generici.
- Spazio: le scritte non vanno MAI sopra linee o forme di un altro elemento; tienile ad almeno 10 da linee e bordi, mettile accanto a ciò che indicano, in zone libere.
- Il testo deve stare DENTRO la sua forma: il font è a mano e largo, conta circa 10 di larghezza per carattere a font-size 16 (più margine). Scritte brevi.
- Scrivi <say> PRIMA di <svg> in ogni passo.]`;

function buildBackend(config: OpenMateConfig, secrets?: Secrets): { backend: ReasoningBackend; vision: boolean } {
  // Modalità abbonamento Claude: riusa il login di Claude Code (nessuna API key).
  const subscription =
    config.provider.auth === 'claude-subscription'
      ? makeSubscriptionTokenProvider()
      : undefined;
  const provider = createProvider({
    name: subscription ? 'anthropic' : config.provider.name,
    baseURL: config.provider.baseURL,
    apiKey: subscription ? undefined : secrets?.apiKey,
    subscription,
  });
  const backend = new DirectProviderBackend(provider.languageModel(config.provider.model), {
    systemPrefix: provider.systemPrefix,
  });
  // openai-compatible è dichiarato senza vision perché dipende dal modello dietro
  // il gateway (es. Claude via Vercel la ha): lì escludiamo solo i modelli noti ciechi.
  const vision = provider.capabilities.vision || !BLIND_MODELS.test(config.provider.model);
  return { backend, vision };
}
