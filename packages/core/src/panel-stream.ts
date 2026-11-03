/**
 * Spiegazione a pannello in streaming. Il modello scrive nel testo:
 *
 *   <panel title="Come vola l'F-35">
 *   <step><say>Il motore spinge l'aria verso il basso.</say>
 *   <svg> …frammento SVG di questo passo… </svg>
 *   <mark type="highlight" x="10" y="20" w="100" h="40" text="motore"/></step>
 *   …
 *   </panel>
 *
 * Il parser riceve i pezzi di testo man mano che arrivano ed emette ogni passo
 * appena è completo: l'interfaccia lo disegna (e la voce lo legge) mentre il
 * modello sta ancora scrivendo i successivi. Il testo fuori dal pannello resta
 * testo normale della risposta.
 */

export interface PanelMark {
  type: 'point' | 'highlight' | 'label' | 'note';
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
}

export interface PanelStreamStep {
  index: number;
  say: string;
  /** Contenuto interno dell'<svg> del passo (non ancora sanificato: lo fa l'interfaccia). */
  svg: string;
  marks: PanelMark[];
}

export type PanelStreamEvent =
  | { op: 'start'; title: string }
  /** La frase di un passo, appena scritta: la voce può partire mentre arriva il disegno. */
  | { op: 'say'; index: number; say: string }
  | ({ op: 'step' } & PanelStreamStep)
  | { op: 'end' };

const MARK_TYPES = new Set(['point', 'highlight', 'label', 'note']);

export class PanelStream {
  private buf = '';
  private inside = false;
  private index = 0;
  /** Indice del passo la cui frase è già stata emessa in anticipo. */
  private saidIndex = -1;
  private readonly says: string[] = [];

  /** Le frasi dei passi emessi finora (la risposta "detta"). */
  get spoken(): string {
    return this.says.join(' ');
  }

  /** Un pannello è stato aperto in questo turno. */
  get used(): boolean {
    return this.inside || this.index > 0;
  }

  /** Aggiunge testo; restituisce il testo normale da mostrare e gli eventi del pannello. */
  feed(chunk: string): { text: string; events: PanelStreamEvent[] } {
    this.buf += chunk;
    return this.drain(false);
  }

  /** Fine dello stream: chiude un pannello lasciato aperto e restituisce il resto. */
  end(): { text: string; events: PanelStreamEvent[] } {
    return this.drain(true);
  }

  private drain(final: boolean): { text: string; events: PanelStreamEvent[] } {
    const events: PanelStreamEvent[] = [];
    let text = '';
    for (;;) {
      if (!this.inside) {
        const open = this.buf.search(/<panel\b/);
        if (open < 0) {
          // tieni da parte un possibile inizio di tag spezzato a metà ("<pan…")
          const keep = final ? this.buf.length : safePrefixLength(this.buf);
          text += this.buf.slice(0, keep);
          this.buf = this.buf.slice(keep);
          break;
        }
        const close = this.buf.indexOf('>', open);
        if (close < 0) {
          text += this.buf.slice(0, open);
          this.buf = this.buf.slice(open);
          break;
        }
        text += this.buf.slice(0, open);
        const title = attr(this.buf.slice(open, close + 1), 'title') ?? '';
        this.buf = this.buf.slice(close + 1);
        this.inside = true;
        events.push({ op: 'start', title });
        continue;
      }
      const step = this.buf.match(/<step\b[^>]*>([\s\S]*?)<\/step>/);
      const endIdx = this.buf.indexOf('</panel>');
      if (step?.index !== undefined && (endIdx < 0 || step.index < endIdx)) {
        events.push(...this.step(step[1]));
        this.buf = this.buf.slice(step.index + step[0].length);
        continue;
      }
      // passo ancora in scrittura: se la frase è completa, emettila subito
      if (this.saidIndex < this.index) {
        const say = this.buf.match(/<step\b[^>]*>[\s\S]*?<say>([\s\S]*?)<\/say>/);
        if (say?.index !== undefined && (endIdx < 0 || say.index < endIdx) && say[1].trim()) {
          this.saidIndex = this.index;
          events.push({ op: 'say', index: this.index, say: say[1].trim() });
        }
      }
      if (endIdx >= 0) {
        this.buf = this.buf.slice(endIdx + '</panel>'.length);
        this.inside = false;
        events.push({ op: 'end' });
        continue;
      }
      if (final) {
        // pannello troncato: salva l'ultimo passo se ha almeno la frase
        const partial = this.buf.match(/<step\b[^>]*>([\s\S]*)$/);
        if (partial && /<say>[\s\S]*?<\/say>/.test(partial[1])) events.push(...this.step(partial[1]));
        this.buf = '';
        this.inside = false;
        events.push({ op: 'end' });
      }
      break;
    }
    return { text, events };
  }

  private step(body: string): PanelStreamEvent[] {
    const out: PanelStreamEvent[] = [];
    const step = this.parseStep(body);
    if (this.saidIndex < step.index && step.say) out.push({ op: 'say', index: step.index, say: step.say });
    this.saidIndex = Math.max(this.saidIndex, step.index);
    out.push(step);
    return out;
  }

  private parseStep(body: string): { op: 'step' } & PanelStreamStep {
    const say = (body.match(/<say>([\s\S]*?)<\/say>/)?.[1] ?? '').trim();
    const svg = body.match(/<svg\b[^>]*>([\s\S]*?)(?:<\/svg>|$)/)?.[1] ?? '';
    const marks: PanelMark[] = [];
    for (const m of body.matchAll(/<mark\b([^>]*)\/?>/g)) {
      const type = attr(m[1], 'type') ?? 'highlight';
      const x = Number(attr(m[1], 'x'));
      const y = Number(attr(m[1], 'y'));
      if (!MARK_TYPES.has(type) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      const mark: PanelMark = { type: type as PanelMark['type'], x, y };
      const w = Number(attr(m[1], 'w'));
      const h = Number(attr(m[1], 'h'));
      if (Number.isFinite(w)) mark.w = w;
      if (Number.isFinite(h)) mark.h = h;
      const t = attr(m[1], 'text');
      if (t) mark.text = t;
      marks.push(mark);
    }
    if (say) this.says.push(say);
    return { op: 'step', index: this.index++, say, svg: svg.trim(), marks };
  }
}

/** Valore di un attributo (virgolette doppie o singole). */
function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
}

/** Quanta parte del buffer è sicuramente testo (non l'inizio spezzato di "<panel"). */
function safePrefixLength(buf: string): number {
  const lt = buf.lastIndexOf('<');
  if (lt < 0) return buf.length;
  return '<panel'.startsWith(buf.slice(lt, lt + 6)) ? lt : buf.length;
}
