import { Cron } from 'croner';

/** Trigger di un ciclo (strutturalmente compatibile con core.Trigger). */
export type SchedulerTrigger =
  | { kind: 'heartbeat' }
  | { kind: 'cron'; name: string }
  | { kind: 'user_message'; content: string };

export interface SchedulerOptions {
  /** Intervallo dell'heartbeat in ms. */
  intervalMs: number;
  /** Espressioni cron (croner). */
  cron?: string[];
  /** Pre-check deterministico: se false, il tick NON avvia un ciclo (niente LLM). */
  shouldRun: () => boolean | Promise<boolean>;
  /** Esegue un ciclo cognitivo per il trigger dato. */
  onCycle: (trigger: SchedulerTrigger) => Promise<void>;
  /** Invocato quando un heartbeat viene saltato dal pre-check. */
  onSkip?: () => void;
}

/**
 * Scheduler: heartbeat a intervallo + cron, con pre-check deterministico e coda
 * serializzata (un ciclo alla volta); i messaggi utente hanno priorità. Vedi docs/02.
 */
export class Scheduler {
  private timer?: ReturnType<typeof setInterval>;
  private cronJobs: Cron[] = [];
  private queue: SchedulerTrigger[] = [];
  private running = false;
  private intervalMs: number;
  private dynamicCron = new Map<string, Cron>();

  constructor(private readonly opts: SchedulerOptions) {
    this.intervalMs = opts.intervalMs;
  }

  /** Valida un'espressione cron (5-6 campi). */
  static isValidCron(expr: string): boolean {
    try {
      new Cron(expr, { paused: true }).stop();
      return true;
    } catch {
      return false;
    }
  }

  /** Registra un cron dinamico (task ricorrente). Sostituisce quello con lo stesso id. */
  addCron(id: string, expr: string, onFire: () => void): void {
    this.removeCron(id);
    this.dynamicCron.set(id, new Cron(expr, onFire));
  }

  removeCron(id: string): void {
    this.dynamicCron.get(id)?.stop();
    this.dynamicCron.delete(id);
  }

  /** Prossima esecuzione (ISO) di un cron dinamico, o null. */
  nextRun(id: string): string | null {
    return this.dynamicCron.get(id)?.nextRun()?.toISOString() ?? null;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runHeartbeatOnce();
    }, this.intervalMs);
    this.timer.unref?.();
    for (const expr of this.opts.cron ?? []) {
      this.cronJobs.push(new Cron(expr, () => void this.enqueue({ kind: 'cron', name: expr })));
    }
  }

  /** Cambia il ritmo dell'heartbeat a runtime (l'agente può regolarsi da sé). */
  setHeartbeat(intervalMs: number): void {
    this.intervalMs = Math.max(1000, Math.round(intervalMs));
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => void this.runHeartbeatOnce(), this.intervalMs);
      this.timer.unref?.();
    }
  }

  getHeartbeatMs(): number {
    return this.intervalMs;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    for (const job of this.cronJobs) job.stop();
    this.cronJobs = [];
    for (const job of this.dynamicCron.values()) job.stop();
    this.dynamicCron.clear();
  }

  /** Un messaggio utente: bypassa il pre-check e ha priorità sulla coda. */
  async submitUserMessage(content: string): Promise<void> {
    await this.enqueue({ kind: 'user_message', content }, true);
  }

  /** Esegue un singolo heartbeat: pre-check → ciclo, oppure skip (niente LLM). */
  async runHeartbeatOnce(): Promise<boolean> {
    const ok = await this.opts.shouldRun();
    if (!ok) {
      this.opts.onSkip?.();
      return false;
    }
    await this.enqueue({ kind: 'heartbeat' });
    return true;
  }

  private async enqueue(trigger: SchedulerTrigger, priority = false): Promise<void> {
    if (priority) this.queue.unshift(trigger);
    else this.queue.push(trigger);
    await this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let next = this.queue.shift();
      while (next) {
        await this.opts.onCycle(next);
        next = this.queue.shift();
      }
    } finally {
      this.running = false;
    }
  }
}
