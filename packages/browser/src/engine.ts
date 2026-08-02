import type { PageSnapshot } from './session.js';

export interface TabInfo {
  index: number;
  title: string;
  url: string;
  active: boolean;
}

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
  /** Scorre la pagina (amount>0 = giù). */
  scroll(amount: number): Promise<PageSnapshot>;
  /** Attende che compaia un testo, o N secondi. */
  waitFor(opts: { text?: string; seconds?: number }): Promise<PageSnapshot>;
  /** Preme un tasto sulla pagina (Enter, Escape, Tab, PageDown…). */
  key(key: string): Promise<PageSnapshot>;
  /** Seleziona un valore in un menu a tendina (<select>) dato il suo ref. */
  select(ref: number, value: string): Promise<PageSnapshot>;
  /** Elenca le schede aperte. */
  tabs(): Promise<TabInfo[]>;
  /** Apre una nuova scheda e ci naviga. */
  newTab(url: string): Promise<PageSnapshot>;
  /** Passa alla scheda con l'indice dato. */
  selectTab(index: number): Promise<PageSnapshot>;
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
  scroll(amount: number): Promise<PageSnapshot> {
    return this.rpc('scroll', { amount }) as Promise<PageSnapshot>;
  }
  waitFor(opts: { text?: string; seconds?: number }): Promise<PageSnapshot> {
    return this.rpc('waitFor', opts) as Promise<PageSnapshot>;
  }
  key(key: string): Promise<PageSnapshot> {
    return this.rpc('key', { key }) as Promise<PageSnapshot>;
  }
  select(ref: number, value: string): Promise<PageSnapshot> {
    return this.rpc('select', { ref, value }) as Promise<PageSnapshot>;
  }
  tabs(): Promise<TabInfo[]> {
    return this.rpc('tabs') as Promise<TabInfo[]>;
  }
  newTab(url: string): Promise<PageSnapshot> {
    return this.rpc('newTab', { url }) as Promise<PageSnapshot>;
  }
  selectTab(index: number): Promise<PageSnapshot> {
    return this.rpc('selectTab', { index }) as Promise<PageSnapshot>;
  }
}
