import { compileContacts } from './contacts.js';
import {
  LIMITS,
  SHAPES,
  type SceneHeader,
  type SceneLabel,
  type SceneNode,
  validateHeader,
  validateLabel,
  validateNode,
} from './schema.js';

/**
 * Scena 3D in streaming. Il modello scrive nel testo della risposta:
 *
 *   Te lo costruisco.
 *   <scene3d>{ "version": 1, "title": …, "materials": {…}, "nodes": [ {…}, {…} ] }</scene3d>
 *
 * Il parser legge il JSON man mano che arriva: emette l'intestazione appena
 * inizia `nodes`, poi ogni nodo appena è chiuso, così l'interfaccia costruisce il
 * modello pezzo per pezzo mentre il modello scrive il resto. I nodi non validi si
 * scartano (gli errori arrivano nell'evento finale); il testo fuori dal blocco
 * resta testo normale della risposta.
 */

export type SceneStreamEvent =
  | { op: 'start'; header: SceneHeader }
  | { op: 'node'; index: number; node: SceneNode }
  | { op: 'labels'; labels: SceneLabel[] }
  /** `nodes`: nodi mostrati; `errors`: cosa è stato scartato e perché. */
  /** `source`: il JSON della scena così come l'ha scritto il modello (per i dump di debug). */
  | {
      op: 'end';
      title: string;
      nodes: number;
      errors: string[];
      source?: string;
      warnings?: string[];
      pendingRepair?: boolean;
      preview?: boolean;
    };

/**
 * Dettaglio di una parte (seconda chiamata al modello, vedi core/scene-detail): una scena a sé,
 * nello spazio della parte `target`, che l'interfaccia mette al posto del pezzo grezzo.
 */
export type SceneDetailEvent =
  /** Le parti che si stanno dettagliando: subito, prima che il modello risponda. */
  | { op: 'detail-plan'; targets: string[] }
  | { op: 'detail-start'; target: string; header: SceneHeader }
  | { op: 'detail-node'; target: string; node: SceneNode }
  | { op: 'detail-end'; target: string; nodes: number; errors: string[] }
  /**
   * Revisione con la vista (vedi core/scene-review): parti riscritte (stesso id) o nuove in `nodes`,
   * parti da togliere in `remove`. L'interfaccia ricostruisce la scena con le correzioni.
   */
  | { op: 'patch'; remove: string[]; nodes: SceneNode[]; errors: string[] };

const OPEN = '<scene3d>';
const CLOSE = '</scene3d>';

export class SceneStream {
  private buf = '';
  private inside = false;
  /** Testo JSON del blocco aperto e punto fino a cui è stato analizzato. */
  private json = '';
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private stringStart = -1;
  private lastString = '';
  private key = '';
  private rootStart = -1;
  private nodesKeyAt = -1;
  private inNodes = false;
  private nodeStart = -1;
  private done = false;
  private header?: SceneHeader;
  private shown = 0;
  private objects = 0;
  private errors: string[] = [];
  private index = 0;
  /** Titolo dell'ultima scena e quanti nodi ha mostrato. */
  title = '';
  nodes = 0;

  /** Una scena è stata aperta in questo turno. */
  get used(): boolean {
    return this.inside || this.title !== '' || this.nodes > 0;
  }

  feed(chunk: string): { text: string; events: SceneStreamEvent[] } {
    this.buf += chunk;
    return this.drain(false);
  }

  end(): { text: string; events: SceneStreamEvent[] } {
    return this.drain(true);
  }

  private drain(final: boolean): { text: string; events: SceneStreamEvent[] } {
    const events: SceneStreamEvent[] = [];
    let text = '';
    for (;;) {
      if (!this.inside) {
        const open = this.buf.indexOf(OPEN);
        if (open < 0) {
          const keep = final ? this.buf.length : safePrefixLength(this.buf);
          text += this.buf.slice(0, keep);
          this.buf = this.buf.slice(keep);
          break;
        }
        text += this.buf.slice(0, open);
        this.buf = this.buf.slice(open + OPEN.length);
        this.reset();
        this.inside = true;
        continue;
      }
      const close = this.buf.indexOf(CLOSE);
      const body = close >= 0 ? this.buf.slice(0, close) : this.buf;
      this.json += body;
      this.buf = close >= 0 ? this.buf.slice(close + CLOSE.length) : '';
      this.scan(events);
      if (close >= 0 || final) {
        this.finish(events);
        this.inside = false;
        continue;
      }
      break;
    }
    return { text, events };
  }

  private reset(): void {
    this.json = '';
    this.pos = 0;
    this.depth = 0;
    this.inString = false;
    this.escaped = false;
    this.key = '';
    this.rootStart = -1;
    this.nodesKeyAt = -1;
    this.inNodes = false;
    this.nodeStart = -1;
    this.done = false;
    this.header = undefined;
    this.deferredNodes = [];
    this.warnings = [];
    this.preview = false;
    this.shown = 0;
    this.objects = 0;
    this.errors = [];
    this.index = 0;
  }

  /** Avanza sul JSON arrivato finora, carattere per carattere (stringhe ed escape compresi). */
  private scan(events: SceneStreamEvent[]): void {
    const s = this.json;
    for (; this.pos < s.length && !this.done; this.pos++) {
      const c = s[this.pos];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') {
          this.inString = false;
          this.lastString = s.slice(this.stringStart + 1, this.pos);
        }
        continue;
      }
      if (this.rootStart < 0) {
        // prima della radice: salta recinti ```json e testo spurio
        if (c === '{') {
          this.rootStart = this.pos;
          this.depth = 1;
        }
        continue;
      }
      switch (c) {
        case '"':
          this.inString = true;
          this.stringStart = this.pos;
          break;
        case ':':
          if (this.depth === 1) {
            this.key = this.lastString;
            if (this.key === 'nodes') this.nodesKeyAt = s.lastIndexOf('"nodes"', this.pos);
          }
          break;
        case '{':
        case '[':
          if (c === '[' && this.depth === 1 && this.key === 'nodes') {
            this.inNodes = true;
            this.startHeader(events);
          } else if (c === '{' && this.inNodes && this.depth === 2) this.nodeStart = this.pos;
          this.depth++;
          break;
        case '}':
        case ']':
          this.depth--;
          if (c === '}' && this.inNodes && this.depth === 2 && this.nodeStart >= 0) {
            this.takeNode(s.slice(this.nodeStart, this.pos + 1), events);
            this.nodeStart = -1;
          } else if (c === ']' && this.inNodes && this.depth === 1) this.inNodes = false;
          else if (this.depth === 0) this.done = true;
          break;
      }
    }
  }

  /** L'intestazione è tutto ciò che precede la chiave "nodes". */
  private startHeader(events: SceneStreamEvent[]): void {
    const head = this.json.slice(this.rootStart, this.nodesKeyAt).replace(/,\s*$/, '');
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(`${head}}`);
    } catch {
      raw = {};
    }
    this.adoptHeader(raw, events);
  }

  private adoptHeader(raw: Record<string, unknown>, events: SceneStreamEvent[]): void {
    // tolleranza: version e materials mancanti non devono buttare via tutta la scena
    const candidate: Record<string, unknown> = { version: 1, materials: {}, ...raw };
    const errors = validateHeader(candidate);
    if (errors.length) {
      // i materiali sbagliati si scartano uno per uno, il resto dell'intestazione resta
      this.errors.push(...errors);
      // un materiale sbagliato perde solo i campi sbagliati (es. "cut" senza section);
      // si scarta solo se nemmeno così è valido
      const ok = (name: string, def: unknown) =>
        validateHeader({ version: 1, materials: { [name]: def }, section: candidate.section })
          .length === 0;
      const materials = Object.fromEntries(
        Object.entries((candidate.materials ?? {}) as Record<string, unknown>).flatMap(
          ([name, def]) => {
            if (ok(name, def)) return [[name, def]];
            if (def && typeof def === 'object' && !Array.isArray(def)) {
              const fixed = Object.fromEntries(
                Object.entries(def).filter(([k, v]) => ok(name, { color: '#888888', [k]: v })),
              );
              if (ok(name, fixed)) return [[name, fixed]];
            }
            return [];
          },
        ),
      );
      const header = { version: 1 as const, materials } as SceneHeader;
      if (candidate.contacts !== undefined)
        header.contacts = candidate.contacts as SceneHeader['contacts'];
      if (typeof candidate.title === 'string') header.title = candidate.title;
      if (typeof candidate.size === 'number' && candidate.size > 0) header.size = candidate.size;
      if (candidate.style === 'maquette' || candidate.style === 'real')
        header.style = candidate.style;
      if (validateHeader({ ...header, camera: candidate.camera }).length === 0 && candidate.camera)
        header.camera = candidate.camera as SceneHeader['camera'];
      if (
        validateHeader({ ...header, section: candidate.section }).length === 0 &&
        candidate.section
      )
        header.section = candidate.section as SceneHeader['section'];
      this.header = header;
    } else this.header = candidate as unknown as SceneHeader;
    this.title = this.header.title ?? '';
    events.push({ op: 'start', header: this.header });
  }

  private takeNode(text: string, events: SceneStreamEvent[]): void {
    const index = this.index++;
    let node: unknown;
    try {
      node = JSON.parse(text);
    } catch {
      this.errors.push(`nodes[${index}]: JSON non valido`);
      return;
    }
    if (!this.header) return;
    if (this.header.contacts !== undefined) {
      this.adopt(normalize(node), index, events);
      return;
    }
    // sotto-pezzi con attach (es. la batteria dentro la fusoliera scritta come suo figlio):
    // diventano parti a sé, montate dopo la loro madre
    const [own, ...mounted] = hoist(normalize(node), () => `parte_${index}_${++this.hoisted}`);
    if (own !== null) this.adopt(own, index, events);
    for (const m of mounted) this.adopt(m, this.index++, events);
  }

  private hoisted = 0;
  private deferredNodes: SceneNode[] = [];
  private warnings: string[] = [];
  private preview = false;

  private source(): string | undefined {
    // fino all'ultima graffa: niente tag di chiusura né testo dopo il JSON
    return this.rootStart >= 0
      ? this.json.slice(this.rootStart, this.json.lastIndexOf('}') + 1)
      : undefined;
  }

  private adopt(node: unknown, index: number, events: SceneStreamEvent[]): void {
    if (!this.header) return;
    const path = `nodes[${index}]`;
    // un materiale mai definito (o scartato): la parte usa quello ereditato, non sparisce
    const known = this.header.materials;
    const dropMissing = (n: unknown): void => {
      if (!n || typeof n !== 'object' || Array.isArray(n)) return;
      const o = n as Record<string, unknown>;
      if (typeof o.material === 'string' && !(o.material in known)) {
        this.warnings.push(`${path}: materiale «${o.material}» non definito, uso quello di base`);
        delete o.material;
      }
      if (Array.isArray(o.children)) o.children.forEach(dropMissing);
    };
    dropMissing(node);
    let { errors, objects } = validateNode(node, this.header, path);
    if (errors.length) {
      this.errors.push(...errors);
      // un errore in un figlio non deve far sparire tutta la parte: si scartano solo i figli sbagliati
      node = prune(node, this.header);
      ({ errors, objects } = validateNode(node, this.header, path));
      if (errors.length) {
        // nel log anche com'era scritto il nodo: si vede dove il modello ha messo ciò che manca
        if (node && typeof node === 'object')
          this.errors.push(`${path}: scritto con ${Object.keys(node).join(', ')}`);
        return;
      }
    }
    if (this.objects + objects > LIMITS.objects) {
      this.errors.push(`nodes[${index}]: oltre ${LIMITS.objects} oggetti, scartato`);
      return;
    }
    this.objects += objects;
    this.shown++;
    this.nodes = this.shown;
    if (this.header.contacts !== undefined) this.deferredNodes.push(node as SceneNode);
    else events.push({ op: 'node', index, node: node as SceneNode });
  }

  /** Fine del blocco: etichette in coda (se il JSON è completo) e riepilogo. */
  private finish(events: SceneStreamEvent[]): void {
    if (this.rootStart >= 0) {
      let full: Record<string, unknown> | undefined;
      try {
        full = JSON.parse(this.json.slice(this.rootStart, this.json.lastIndexOf('}') + 1));
      } catch {
        full = undefined;
      }
      // nessun "nodes" visto in streaming (ordine dei campi diverso): usa il JSON intero
      if (full && !this.header) {
        const { nodes, labels, ...head } = full;
        this.adoptHeader(head, events);
        if (Array.isArray(nodes)) for (const n of nodes) this.takeNode(JSON.stringify(n), events);
      }
      if (this.header?.contacts !== undefined) {
        if (!full) this.errors.push('contacts: JSON della scena incompleto');
        const compiled = compileContacts({ ...this.header, nodes: this.deferredNodes });
        this.errors.push(...compiled.errors);
        if (!this.errors.length && full) {
          compiled.scene.nodes.forEach((node, index) => events.push({ op: 'node', index, node }));
        } else {
          this.shown = this.nodes = 0;
          if (
            full &&
            this.errors.every((e) => e.startsWith('contacts.')) &&
            this.deferredNodes.length
          ) {
            this.preview = true;
            this.deferredNodes.forEach((node, index) => events.push({ op: 'node', index, node }));
          }
        }
      } else if (full?.contacts !== undefined) {
        this.errors.push('contacts: il campo contacts deve precedere nodes');
        this.shown = this.nodes = 0;
      }
      if (full && Array.isArray(full.labels)) {
        const labels = full.labels.filter((l, i) => {
          const errors = validateLabel(l, `labels[${i}]`);
          this.errors.push(...errors);
          return errors.length === 0;
        }) as SceneLabel[];
        if (labels.length) events.push({ op: 'labels', labels });
      }
      if (!full && !this.header) this.errors.push('scena: JSON incompleto o non valido');
    }
    if (this.header || this.shown)
      events.push({
        op: 'end',
        title: this.title,
        nodes: this.shown,
        errors: this.errors,
        ...(this.preview ? { preview: true } : {}),
        ...(this.warnings.length ? { warnings: this.warnings } : {}),
        source: this.source(),
      });
    else if (this.errors.length)
      events.push({ op: 'end', title: '', nodes: 0, errors: this.errors, source: this.source() });
  }
}

/** Oggetti in cui il modello a volte racchiude i parametri della forma. */
const PARAM_WRAPPERS = [
  'shapeArgs',
  'shapeParams',
  'args',
  'params',
  'parameters',
  'geometry',
  'props',
];
/** Forme la cui misura è `size`: un `scale` senza `size` è la misura (box unitario scalato). */
const SIZED = new Set(['box', 'roundedBox']);
const isVec3 = (v: unknown): v is number[] =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && x > 0);

/**
 * Sviste frequenti del modello sul nome della forma, tutte senza ambiguità:
 * "shape": {"type": "profile", "points": …} (forma annidata), "lathe": {…}
 * (nome della forma come chiave) e "type": "box" al posto di "shape". E sui
 * parametri: racchiusi in "shapeArgs"/"params"/…, oppure la misura di un box
 * scritta in "scale" o "dimensions" invece di "size".
 */
function normalize(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  let n = node as Record<string, unknown>;
  const isParams = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (isParams(n.shape)) {
    const { type, kind, name, ...params } = n.shape as Record<string, unknown>;
    n = { ...params, ...n, shape: type ?? kind ?? name };
  }
  if (n.shape === undefined) {
    const named = Object.keys(n).filter((k) => k in SHAPES && isParams(n[k]));
    if (named.length === 1) {
      const { [named[0]]: params, ...rest } = n;
      n = { ...(params as Record<string, unknown>), ...rest, shape: named[0] };
    } else if (typeof n.type === 'string' && n.type in SHAPES) {
      const { type, ...rest } = n;
      n = { ...rest, shape: type };
    }
  }
  if (typeof n.shape === 'string') {
    for (const k of PARAM_WRAPPERS) {
      if (!isParams(n[k])) continue;
      const { [k]: params, ...rest } = n;
      n = { ...(params as Record<string, unknown>), ...rest };
    }
    if (SIZED.has(n.shape as string) && n.size === undefined) {
      const { dimensions, dims, scale, ...rest } = n;
      const size =
        [dimensions, dims, scale].find(isVec3) ??
        (typeof scale === 'number' && scale > 0 ? [scale, scale, scale] : undefined);
      if (size) n = { ...rest, size, ...(isVec3(dimensions) || isVec3(dims) ? { scale } : {}) };
      if (n.scale === undefined) delete n.scale;
    }
  }
  // aggancio appena fuori dall'ingombro (es. 1.05): vale il bordo, la parte non va persa
  const at = isParams(n.attach) ? (n.attach as Record<string, unknown>).at : undefined;
  if (Array.isArray(at) && at.length === 3 && at.every((v) => typeof v === 'number'))
    n = {
      ...n,
      attach: { ...(n.attach as object), at: at.map((v) => Math.min(1, Math.max(0, v))) },
    };
  if (Array.isArray(n.children)) n = { ...n, children: n.children.map(normalize) };
  return n;
}

/**
 * Stacca dal nodo i figli (a ogni livello) che hanno un attach: tornano come parti di primo
 * livello, in ordine, dopo il nodo. Ereditano dal genitore il materiale (se non ne hanno) e la
 * specchiatura; un genitore senza id ne riceve uno, se un figlio non dice a cosa attaccarsi.
 */
function hoist(
  node: unknown,
  newId: () => string,
  inherited?: { material?: unknown; mirror?: unknown },
): unknown[] {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [node];
  const n = { ...(node as Record<string, unknown>) };
  if (!Array.isArray(n.children)) return [n];
  // Un gruppo in movimento è un corpo unico: i montaggi restano nel suo spazio locale.
  if (n.animation || n.spin) return [n];
  const material = n.material ?? inherited?.material;
  const mirror = n.mirror ?? inherited?.mirror;
  const keep: unknown[] = [];
  const out: unknown[] = [];
  for (const child of n.children) {
    const c = child as Record<string, unknown>;
    if (
      c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      c.attach &&
      typeof c.attach === 'object'
    ) {
      const attach = { ...(c.attach as Record<string, unknown>) };
      if (attach.to === undefined) {
        if (typeof n.id !== 'string') n.id = newId();
        attach.to = n.id;
      }
      const top: Record<string, unknown> = { ...c, attach };
      if (top.material === undefined && material !== undefined) top.material = material;
      if (top.mirror === undefined && mirror !== undefined) top.mirror = mirror;
      out.push(...hoist(top, newId, { material, mirror }));
    } else {
      const [kept, ...deeper] = hoist(c, newId, { material, mirror });
      keep.push(kept);
      out.push(...deeper);
    }
  }
  n.children = keep;
  if (!keep.length) {
    // un gruppo rimasto vuoto sparisce: restano le sue parti montate
    if (n.shape === undefined) return [null, ...out];
    delete n.children;
  }
  return [n, ...out];
}

/** Il nodo senza i figli (a ogni livello) che non passano la validazione. */
function prune(node: unknown, header: SceneHeader): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node;
  const n = node as SceneNode;
  if (!Array.isArray(n.children)) return n;
  const children = n.children
    .map((c) => prune(c, header))
    .filter((c) => validateNode(c, header, '').errors.length === 0) as SceneNode[];
  return { ...n, children };
}

/** Quanta parte del buffer è sicuramente testo (non l'inizio spezzato di "<scene3d>"). */
function safePrefixLength(buf: string): number {
  const lt = buf.lastIndexOf('<');
  if (lt < 0) return buf.length;
  return OPEN.startsWith(buf.slice(lt, lt + OPEN.length)) ? lt : buf.length;
}
