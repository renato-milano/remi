/**
 * Seconda passata con la vista: finito il modello 3D, l'interfaccia rende due viste di ciò che ha
 * costruito e il modello le confronta con l'oggetto vero. Le parti sbagliate (proporzioni, montaggio,
 * forme, parti mancanti) tornano come correzioni: nodi riscritti con lo stesso id, nodi nuovi, id da
 * togliere. L'interfaccia ricostruisce la scena con le correzioni, senza riscrivere tutto il resto.
 */
import type { ReasoningBackend } from '@openmate/llm';
import { SCENE_GUIDE, type SceneDetailEvent, type SceneNode, SceneStream } from '@openmate/scene3d';

const OPEN = '<scene3d-fix>';
const CLOSE = '</scene3d-fix>';
/** Quante parti può toccare una revisione: oltre, il modello sta riscrivendo la scena, non correggendola. */
const MAX_FIXES = 6;

const REVIEW_RULES = `Ora REVISIONI un modello 3D appena costruito guardandone due viste (immagini qui sotto). Confrontalo con l'oggetto VERO che rappresenta: proporzioni fra le parti, posizione e montaggio, parti fuori posto o staccate, parti che mancano per riconoscerlo, forme sbagliate (un organo fatto di cilindri, una gabbia piena, un'ala troppo corta).
Rispondi SOLO con ${OPEN}{"remove": ["id", …], "nodes": [ … ]}${CLOSE}, niente testo.
- "nodes": le parti da CORREGGERE riscritte per intero con lo STESSO id (misure in metri, attach come nella guida, i materiali già definiti) e le parti da AGGIUNGERE con un id nuovo. Al massimo ${MAX_FIXES} nodi: solo ciò che è davvero sbagliato, il resto non si tocca.
- "remove": id delle parti da togliere (doppioni, parti inventate che l'oggetto vero non ha).
- Le etichette (label) restano: ricopiale nei nodi che riscrivi.
- Se il modello è già fedele rispondi ${OPEN}{"remove": [], "nodes": []}${CLOSE}.`;

/** Prompt della revisione: l'oggetto, la scena com'è scritta, e le immagini. */
export function reviewPrompt(title: string, source: string): string {
  return `Oggetto: ${title || 'vedi scena'}.\nModello com'è scritto ora:\n${source}\n\nQui sotto due viste del modello costruito. Cosa va corretto perché somigli all'oggetto vero?`;
}

/** Estrae il JSON delle correzioni dalla risposta (blocco dedicato, oppure il primo oggetto JSON). */
export function parseFix(text: string): { remove: string[]; nodes: SceneNode[] } | undefined {
  let body = text;
  const open = text.indexOf(OPEN);
  if (open >= 0) {
    const close = text.indexOf(CLOSE, open);
    body = text.slice(open + OPEN.length, close >= 0 ? close : undefined);
  }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const fix = JSON.parse(body.slice(start, end + 1)) as { remove?: unknown; nodes?: unknown };
    const remove = Array.isArray(fix.remove)
      ? fix.remove.filter((x): x is string => typeof x === 'string')
      : [];
    const nodes = Array.isArray(fix.nodes)
      ? (fix.nodes.filter((n) => n && typeof n === 'object') as SceneNode[])
      : [];
    return { remove, nodes };
  } catch {
    return undefined;
  }
}

/**
 * I nodi corretti passano dallo stesso parser della scena (validazione, sviste normalizzate, figli con
 * attach promossi a parti): si costruisce una scena fittizia con l'intestazione originale.
 */
export function validateFix(
  source: string,
  fix: { remove: string[]; nodes: SceneNode[] },
): { remove: string[]; nodes: SceneNode[]; errors: string[] } {
  let header: Record<string, unknown> = {};
  try {
    const { nodes: _n, ...rest } = JSON.parse(source) as Record<string, unknown>;
    header = rest;
  } catch {
    /* intestazione minima */
  }
  const stream = new SceneStream();
  const text = `<scene3d>${JSON.stringify({ version: 1, ...header, nodes: fix.nodes })}</scene3d>`;
  const events = [...stream.feed(text).events, ...stream.end().events];
  const nodes: SceneNode[] = [];
  let errors: string[] = [];
  for (const e of events) {
    if (e.op === 'node') nodes.push(e.node);
    if (e.op === 'end') errors = e.errors;
  }
  return { remove: fix.remove, nodes: nodes.slice(0, MAX_FIXES), errors };
}

/**
 * Chiede la revisione e, se ci sono correzioni valide, emette un evento `patch`. Non lancia
 * eccezioni: una revisione fallita lascia il modello com'è.
 */
export async function reviewScene(opts: {
  backend: ReasoningBackend;
  source: string;
  title: string;
  /** Viste del modello costruito, PNG base64 (senza prefisso data:). */
  images: string[];
  emit: (e: SceneDetailEvent) => void;
  signal?: AbortSignal;
}): Promise<void> {
  let text = '';
  const started = Date.now();
  const deadline = AbortSignal.timeout(12000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  try {
    for await (const ev of opts.backend.run({
      system: `${SCENE_GUIDE}\n\n${REVIEW_RULES}`,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: reviewPrompt(opts.title, opts.source) },
            ...opts.images.map((data) => ({
              type: 'image' as const,
              image: data,
              mediaType: 'image/png',
            })),
          ],
        },
      ],
      budget: { maxSteps: 1, wallClockMs: 12_000 },
      signal,
      fast: true,
    })) {
      if (ev.type === 'text-delta') text += ev.text;
    }
  } catch {
    return;
  }
  if (signal.aborted || Date.now() - started >= 12000) return;
  const fix = parseFix(text);
  if (!fix) return;
  const checked = validateFix(opts.source, fix);
  if (!checked.nodes.length && !checked.remove.length) return;
  opts.emit({ op: 'patch', remove: checked.remove, nodes: checked.nodes, errors: checked.errors });
}
