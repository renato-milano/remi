/**
 * Dettaglio in più chiamate: finito il modello 3D intero, le parti spiegate più importanti
 * (al massimo `max`) si ricostruiscono una per una, in parallelo, con tutta l'attenzione del
 * modello su quel pezzo: file di pale, camere, ingranaggi. Ogni dettaglio arriva come scena a
 * sé, nello spazio del pezzo (origine al suo centro, stessi assi, metri), e l'interfaccia lo
 * mette al posto del pezzo grezzo. Il primo modello non aspetta: arriva come prima.
 */
import type { ReasoningBackend } from '@openmate/llm';
import { SCENE_GUIDE, SceneStream, type SceneDetailEvent, type SceneNode } from '@openmate/scene3d';

/** Forme che non si dettagliano: sono già il loro dettaglio, o sono solo frecce e linee. */
const moves = (node: SceneNode): boolean => Boolean(node.animation || node.spin || node.children?.some(moves));
const PLAIN = new Set(['arrow', 'line', 'wheel', 'propeller', 'rotor']);

interface Picked {
  node: SceneNode;
  inside: boolean;
  extent: number;
}

/** Misura grossolana di una parte (metri): la più grande fra le misure che dichiara. */
function extent(n: SceneNode): number {
  const v = (k: string) => (typeof n[k] === 'number' ? (n[k] as number) : 0);
  const size = Array.isArray(n.size) ? Math.max(...(n.size as number[])) : 0;
  const balls = Array.isArray(n.balls) ? Math.max(...(n.balls as number[][]).map((b) => 2 * (b[3] ?? 0))) : 0;
  return Math.max(size, balls, v('length'), v('height'), v('span'), 2 * v('radius'), v('root'));
}

/** La "forma" di una parte, per riconoscere le copie scritte una per una (4 gabbie uguali). */
const signature = (n: SceneNode) => `${n.shape}:${Math.round(extent(n) * 100)}`;

/**
 * Le parti da dettagliare: con etichetta, non il corpo principale, senza gemelli identici
 * (il dettaglio di una sola gabbia su quattro stonerebbe); prima quelle interne, poi le più grandi.
 */
export function partsToDetail(nodes: SceneNode[], max = 3): SceneNode[] {
  const count = new Map<string, number>();
  for (const n of nodes) count.set(signature(n), (count.get(signature(n)) ?? 0) + 1);
  const out: Picked[] = [];
  nodes.forEach((n, i) => {
    if (i === 0 || moves(n) || !n.shape || !n.id || !n.label || PLAIN.has(String(n.shape))) return;
    if ((count.get(signature(n)) ?? 0) > 1) return;
    const at = (n.attach as { at?: number[] } | undefined)?.at;
    const inside = Array.isArray(at) && !at.some((f) => f <= 0 || f >= 1);
    out.push({ node: n, inside, extent: extent(n) });
  });
  return out
    .sort((a, b) => Number(b.inside) - Number(a.inside) || b.extent - a.extent)
    .slice(0, max)
    .map((p) => p.node);
}

const DETAIL_RULES = `Ora DETTAGLI UNA SOLA PARTE di un modello 3D già costruito: la sostituirai con una versione che mostra COME FUNZIONA, in dettaglio.
Scrivi SOLO il blocco <scene3d>{…}</scene3d>, niente testo.
- Spazio: quello della parte. Origine al CENTRO della parte, stessi assi (x dal muso alla coda, y in alto, z di lato), misure in METRI. Il tutto deve stare dentro l'ingombro della parte originale (stesse misure massime).
- NON scrivere "size" né "style". Niente etichette (label): la parte ha già la sua.
- 6-20 nodi: le sotto-parti vere, nell'ordine in cui lavorano, con il loro meccanismo visibile (stadi di pale con "stages", camere, iniettori, ingranaggi con i denti, pistoni, celle, condotti). Usa attach fra le sotto-parti; il primo nodo ha position.
- Materiali: sfumature chiare e scure dello stesso colore per distinguere gli stadi; arancio/rosso solo per ciò che è caldo o brucia; frecce (arrow) per il flusso che attraversa la parte.`;

/** Prompt per il dettaglio di una parte: l'oggetto intero (in breve) e la parte com'è scritta. */
export function detailPrompt(title: string, part: SceneNode): string {
  const { label, ...shape } = part;
  const what = label && typeof label === 'object' ? `«${label.title}»${label.text ? ` — ${label.text}` : ''}` : `«${part.id}»`;
  return (
    `Oggetto: ${title}. Parte da dettagliare: ${what}.\n` +
    `Com'è scritta ora (misure in metri): ${JSON.stringify(shape)}\n` +
    'Ricostruiscila in dettaglio, nello spazio della parte.'
  );
}

/**
 * Lancia i dettagli e ne emette gli eventi (detail-start / detail-node / detail-end, con il
 * `target` = id della parte). Non lancia eccezioni: un dettaglio fallito lascia la parte com'è.
 */
export async function detailScene(opts: {
  backend: ReasoningBackend;
  source: string;
  emit: (e: SceneDetailEvent) => void;
  signal?: AbortSignal;
  max?: number;
}): Promise<void> {
  let scene: { title?: string; nodes?: SceneNode[]; style?: string };
  try {
    scene = JSON.parse(opts.source);
  } catch {
    return;
  }
  const parts = partsToDetail(scene.nodes ?? [], opts.max);
  if (!parts.length) return;
  opts.emit({ op: 'detail-plan', targets: parts.map((p) => String(p.id)) });
  await Promise.all(
    parts.map(async (part) => {
      const target = String(part.id);
      const stream = new SceneStream();
      let ended = false;
      const forward = (events: ReturnType<SceneStream['feed']>['events']) => {
        if (opts.signal?.aborted) return;
        for (const e of events) {
          if (e.op === 'start') opts.emit({ op: 'detail-start', target, header: e.header });
          else if (e.op === 'node') opts.emit({ op: 'detail-node', target, node: e.node });
          else if (e.op === 'end') {
            ended = true;
            opts.emit({ op: 'detail-end', target, nodes: e.nodes, errors: e.errors });
          }
        }
      };
      try {
        for await (const ev of opts.backend.run({
          system: `${SCENE_GUIDE}\n\n${DETAIL_RULES}`,
          messages: [{ role: 'user', content: detailPrompt(scene.title ?? '', part) }],
          budget: { maxSteps: 1, wallClockMs: 90_000 },
          signal: opts.signal,
          fast: true,
        })) {
          if (ev.type === 'text-delta') forward(stream.feed(ev.text).events);
        }
        forward(stream.end().events);
      } catch {
        /* dettaglio non riuscito: resta la parte grezza */
      }
      // in ogni caso la parte chiude: l'interfaccia non resta in attesa
      if (!ended) opts.emit({ op: 'detail-end', target, nodes: 0, errors: ['dettaglio non arrivato'] });
    }),
  );
}
