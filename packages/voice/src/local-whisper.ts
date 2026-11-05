import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { availableParallelism } from 'node:os';

export interface LocalWhisperOptions {
  /** Binario whisper-server (whisper.cpp). */
  binPath: string;
  /** Modello ggml. */
  modelPath: string;
  /** Lingua (es. 'it') o 'auto'. */
  language: string;
  /** Dopo quanto tempo senza richieste spegnere il server (libera ~700 MB). 0 = mai. */
  idleMs?: number;
  /**
   * File con il pid del server: se il daemon muore senza chiuderlo (crash, kill -9)
   * il server resterebbe orfano con il modello in memoria; al riavvio lo si chiude.
   */
  pidFile?: string;
}

const READY_TIMEOUT_MS = 30_000;

/**
 * Trascrizione locale con whisper.cpp: tiene acceso un whisper-server col
 * modello in memoria (così ogni richiesta costa ~0,5 s invece di ricaricarlo),
 * avviato al primo uso e spento dopo un periodo di inattività.
 */
export class LocalWhisper {
  private proc?: ChildProcess;
  private ready?: Promise<string>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private readonly idleMs: number;

  constructor(private readonly opts: LocalWhisperOptions) {
    this.idleMs = opts.idleMs ?? 5 * 60_000;
    killStale(opts.pidFile);
  }

  /** Binario e modello presenti. */
  available(): boolean {
    return existsSync(this.opts.binPath) && existsSync(this.opts.modelPath);
  }

  /** Avvia il server in anticipo (es. alla pressione della hotkey). */
  warm(): void {
    if (this.available()) void this.start().catch(() => {});
  }

  async transcribe(wav: Buffer, signal?: AbortSignal): Promise<string> {
    const base = await this.start();
    this.touch();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav');
    form.append('response_format', 'json');
    form.append('temperature', '0');
    const res = await fetch(`${base}/inference`, { method: 'POST', body: form, signal });
    if (!res.ok) throw new Error(`whisper-server ${res.status}`);
    const json = (await res.json()) as { text?: string };
    this.touch();
    return (json.text ?? '').replace(/\s+/g, ' ').trim();
  }

  stop(): void {
    clearTimeout(this.idleTimer);
    this.proc?.kill();
    this.proc = undefined;
    this.ready = undefined;
    if (this.opts.pidFile) rmSync(this.opts.pidFile, { force: true });
  }

  private touch(): void {
    clearTimeout(this.idleTimer);
    if (this.idleMs <= 0) return; // sempre acceso (es. ascolto di "Hey Remi")
    this.idleTimer = setTimeout(() => this.stop(), this.idleMs);
    this.idleTimer.unref?.();
  }

  private start(): Promise<string> {
    this.ready ??= this.launch().catch((err) => {
      this.stop();
      throw err;
    });
    return this.ready;
  }

  private async launch(): Promise<string> {
    if (!this.available()) throw new Error('whisper locale non disponibile (binario o modello mancante)');
    const port = await freePort();
    const threads = String(Math.max(2, Math.min(8, availableParallelism() - 2)));
    const proc = spawn(
      this.opts.binPath,
      // -nc: niente testo delle richieste precedenti come contesto (altrimenti whisper
      // tende a ripeterlo e "inventa" parole nelle trascrizioni successive)
      ['-m', this.opts.modelPath, '-l', this.opts.language, '--host', '127.0.0.1', '--port', String(port), '-t', threads, '-nc'],
      { stdio: 'ignore' },
    );
    this.proc = proc;
    if (this.opts.pidFile && proc.pid) writeFileSync(this.opts.pidFile, String(proc.pid));
    let exited = false;
    proc.on('exit', () => {
      exited = true;
      if (this.proc === proc) {
        this.proc = undefined;
        this.ready = undefined;
      }
    });
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (exited) throw new Error('whisper-server si è chiuso all\'avvio');
      try {
        const res = await fetch(base);
        if (res.ok) {
          this.touch();
          return base;
        }
      } catch {
        /* non ancora in ascolto */
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('whisper-server non risponde');
  }
}

/** Chiude un whisper-server rimasto da un'esecuzione precedente (solo se è davvero lui). */
function killStale(pidFile?: string): void {
  if (!pidFile || !existsSync(pidFile)) return;
  const pid = Number(readFileSync(pidFile, 'utf8'));
  rmSync(pidFile, { force: true });
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    // il pid potrebbe essere stato riassegnato: verifica che sia whisper-server
    const command =
      process.platform === 'win32'
        ? execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' })
        : execFileSync('ps', ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8' });
    if (command.includes('whisper-server')) process.kill(pid);
  } catch {
    /* processo già terminato */
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}
