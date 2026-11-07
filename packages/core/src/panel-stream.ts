/**
 * Spiegazione a pannello in streaming. Il modello scrive nel testo:
 *
 *   <panel title="Come vola l'F-35">
 *   <step><say>Il motore spinge l'aria verso il basso.</say>
 *   <mark x="420" y="310" w="80" h="40"/>   ← facoltativo: cerchia una zona dello SCHERMO
 *   <svg> …frammento SVG di questo passo… </svg></step>
 *   …
 *   </panel>
 *
 * Il parser riceve i pezzi di testo man mano che arrivano ed emette ogni passo
 * appena è completo: l'interfaccia lo disegna (e la voce lo legge) mentre il
 * modello sta ancora scrivendo i successivi. Il testo fuori dal pannello resta
 * testo normale della risposta.
 */

/** Zona dello schermo da cerchiare mentre si disegna il passo (coordinate dello screenshot visto dal modello). */
export interface PanelMark {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Etichetta breve accanto al segno (es. "la chat"). */
  label?: string;
}

export interface PanelStreamStep {
  index: number;
  say: string;
  /** Contenuto interno dell'<svg> del passo (non ancora sanificato: lo fa l'interfaccia). */
  svg: string;
  /** Zone dello schermo da cerchiare in questo passo (lega la spiegazione a ciò che l'utente guarda). */
  marks?: PanelMark[];
}

export type PanelStreamEvent =
  /** rows/cols: la griglia dichiarata all'inizio, che fissa la dimensione della lavagna prima del primo tratto. */
  | { op: 'start'; title: string; rows?: number; cols?: number; ownColors?: boolean }
  /** La frase di un passo, appena scritta: la voce può partire mentre arriva il disegno. */
  | { op: 'say'; index: number; say: string }
  | ({ op: 'step' } & PanelStreamStep)
  | { op: 'end' };

export class PanelStream {
  private buf = '';
  private inside = false;
  private index = 0;
  /** Indice del passo la cui frase è già stata emessa in anticipo. */
  private saidIndex = -1;
  private readonly says: string[] = [];
  /** Titolo dell'ultimo pannello aperto. */
  title = '';

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
        const tag = this.buf.slice(open, close + 1);
        const title = attr(tag, 'title') ?? '';
        this.buf = this.buf.slice(close + 1);
        this.inside = true;
        this.title = title;
        const start: PanelStreamEvent = { op: 'start', title };
        const rows = gridSize(attr(tag, 'rows'), 12);
        const cols = gridSize(attr(tag, 'cols'), 6);
        if (rows) start.rows = rows;
        if (rows && cols) start.cols = cols;
        // il modello colora da sé (per gruppo o confronto) invece del colore per passo della lavagna
        if (attr(tag, 'colors') === 'own') start.ownColors = true;
        events.push(start);
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
    // se il modello dimentica <svg>, il disegno è il resto del passo (senza frase e cerchi)
    const svg =
      body.match(/<svg\b[^>]*>([\s\S]*?)(?:<\/svg>|$)/)?.[1] ??
      body.replace(/<say>[\s\S]*?<\/say>/, '').replace(/<mark\b[^>]*>/g, '');
    if (say) this.says.push(say);
    const out: { op: 'step' } & PanelStreamStep = { op: 'step', index: this.index++, say, svg: svg.trim() };
    const marks = parseMarks(body.replace(/<svg\b[\s\S]*?(?:<\/svg>|$)/, ''));
    if (marks.length) out.marks = marks;
    return out;
  }
}

/** Un numero intero di righe o colonne, entro `max`; altrimenti nessuna griglia. */
function gridSize(v: string | undefined, max: number): number | undefined {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
}

/** I <mark x y w h/> fuori dall'svg; quelli con numeri mancanti o non validi si scartano. */
function parseMarks(body: string): PanelMark[] {
  const marks: PanelMark[] = [];
  for (const m of body.matchAll(/<mark\b[^>]*>/g)) {
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((k) => Number(attr(m[0], k)));
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    const mark: PanelMark = { x, y, w, h };
    const label = attr(m[0], 'label')?.trim();
    if (label) mark.label = label.slice(0, 40);
    marks.push(mark);
  }
  return marks.slice(0, 3);
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
