import type { PageSnapshot } from './session.js';

/** Motore di navigazione: implementato da Playwright (sessione autonoma) o
 *  dall'estensione (scheda LIVE del tuo Chrome). I tool browser.* usano questa
 *  interfaccia, indipendente dal "dove" gira. */
export interface BrowserEngine {
  open(url: string): Promise<PageSnapshot>;
  snapshot(): Promise<PageSnapshot>;
  read(): Promise<string>;
  click(ref: number): Promise<PageSnapshot>;
  type(ref: number, text: string, submit?: boolean): Promise<PageSnapshot>;
  back(): Promise<PageSnapshot>;
}

/** Invia un'operazione all'estensione e attende il risultato. */
export type Rpc = (op: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Motore che pilota il Chrome LIVE tramite l'estensione (via relay WebSocket). */
export class ExtensionEngine implements BrowserEngine {
  constructor(private readonly rpc: Rpc) {}

  open(url: string): Promise<PageSnapshot> {
    return this.rpc('open', { url }) as Promise<PageSnapshot>;
  }
  snapshot(): Promise<PageSnapshot> {
    return this.rpc('snapshot') as Promise<PageSnapshot>;
  }
  read(): Promise<string> {
    return this.rpc('read').then((r) => (r as { text: string }).text ?? '');
  }
  click(ref: number): Promise<PageSnapshot> {
    return this.rpc('click', { ref }) as Promise<PageSnapshot>;
  }
  type(ref: number, text: string, submit = false): Promise<PageSnapshot> {
    return this.rpc('type', { ref, text, submit }) as Promise<PageSnapshot>;
  }
  back(): Promise<PageSnapshot> {
    return this.rpc('back') as Promise<PageSnapshot>;
  }
}
