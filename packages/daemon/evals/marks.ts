/**
 * Eval dei segni sullo schermo: il modello indica le parti giuste?
 *
 * Ogni caso è uno "schermo" (1440×900 punti, Retina 2×) con una foto e le posizioni vere
 * delle sue parti. Le immagini si preparano come fa Remi (screenshot ridotto a 1366 px col
 * cerchio del puntatore + ingrandimento attorno al puntatore), il prompt è quello vero dei
 * turni "indica", e la risposta (pannello con <mark> o overlay.draw) si confronta con le
 * posizioni vere: un segno è giusto se il suo centro cade sulla parte che nomina.
 *
 *   MARKS_DIR=<cartella con cases.json, full_*.png, zoom_*.png> OPENMATE_API_KEY=… \
 *     npx tsx evals/marks.ts [ripetizioni]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { markPoint } from '@openmate/computer';
import { DirectProviderBackend, createProvider } from '@openmate/llm';
import { InMemoryAuditSink, ToolRegistry, createOverlayTools, createToolContext, wireName } from '@openmate/tools';
import { POINT_LABELS, pointPrompt } from '../src/daemon.js';

interface Part {
  name: string;
  re: string;
  boxes: [number, number, number, number][];
}
interface Case {
  id: string;
  question: string;
  cursorImg: [number, number];
  zone: [number, number, number, number];
  zoomCursor: [number, number];
  parts: Part[];
}
interface Mark {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zoom?: boolean;
  from: 'mark' | 'overlay';
}

const DIR = process.env.MARKS_DIR ?? '.';
const RUNS = Number(process.argv[2] ?? 3);
const MODEL = process.env.MODEL ?? 'google/gemini-3.8-flash';
/** VARIANT=zoom: prova dei segni in coordinate dell'ingrandimento (in="zoom"), prima di portarla in Remi. */
const ZOOM_VARIANT = process.env.VARIANT === 'zoom';
const ZOOM_LABEL =
  'Ingrandimento della zona indicata, a piena risoluzione (per le cose piccole che stanno qui dentro usa le coordinate di QUESTA immagine, con in="zoom"):';
const ZOOM_RULE =
  '\n\n[COORDINATE PRECISE: per una cosa piccola che si vede nell\'ingrandimento, dai le coordinate SULL\'INGRANDIMENTO ' +
  '(0-1000 di quell\'immagine) e aggiungi in="zoom": <mark in="zoom" x="…" y="…" w="…" h="…" label="…"/>; in overlay.draw ' +
  'metti "in":"zoom" sull\'elemento. Senza in="zoom" le coordinate sono dello screenshot intero (usale per le cose grandi o fuori dall\'ingrandimento).]';
const { screen, cases } = JSON.parse(readFileSync(join(DIR, 'cases.json'), 'utf8')) as {
  screen: [number, number];
  cases: Case[];
};
const [SW, SH] = screen;
const policy = { shell: { allow: [], deny: [] }, files: { allow: [] } };
const model = createProvider({
  name: 'openai-compatible',
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.OPENMATE_API_KEY,
}).languageModel(MODEL);

/** I <mark …/> scritti nel testo del pannello. */
function textMarks(text: string): Mark[] {
  const out: Mark[] = [];
  for (const m of text.matchAll(/<mark\b([^>]*)\/?>/g)) {
    const attr = (n: string) => m[1].match(new RegExp(`\\b${n}="([^"]*)"`))?.[1];
    const [x, y, w, h] = ['x', 'y', 'w', 'h'].map((n) => Number(attr(n)));
    if ([x, y, w, h].some((v) => !Number.isFinite(v))) continue;
    out.push({ label: attr('label') ?? '', x, y, w, h, zoom: attr('in') === 'zoom', from: 'mark' });
  }
  return out;
}

/** Dal sistema del modello (0-1000 dello screenshot o dell'ingrandimento) ai punti dello schermo. */
function toScreen(m: Mark, c: Case): { cx: number; cy: number } {
  const [zx, zy, zw, zh] = c.zone;
  const [ox, oy, w, h] = m.zoom ? [zx, zy, zw, zh] : [0, 0, SW, SH];
  return { cx: ox + ((m.x + m.w / 2) / 1000) * w, cy: oy + ((m.y + m.h / 2) / 1000) * h };
}

/** Distanza (punti) dal centro del segno alla scatola più vicina della parte: 0 = dentro. */
function distance(p: { cx: number; cy: number }, part: Part): number {
  return Math.min(
    ...part.boxes.map(([x0, y0, x1, y1]) => {
      const dx = Math.max(x0 - p.cx, 0, p.cx - x1);
      const dy = Math.max(y0 - p.cy, 0, p.cy - y1);
      return Math.hypot(dx, dy);
    }),
  );
}

async function runCase(c: Case): Promise<{ marks: Mark[]; ms: number; text: string }> {
  const full = readFileSync(join(DIR, `full_${c.id}.png`)).toString('base64');
  const zoom = readFileSync(join(DIR, `zoom_${c.id}.png`)).toString('base64');
  const images = [
    { label: POINT_LABELS.cursor, data: await markPoint(full, c.cursorImg[0], c.cursorImg[1]) },
    { label: ZOOM_VARIANT ? ZOOM_LABEL : POINT_LABELS.zoom, data: await markPoint(zoom, c.zoomCursor[0], c.zoomCursor[1]) },
  ];
  const cursor = { x: (c.cursorImg[0] / 1366) * 1000, y: (c.cursorImg[1] / ((1366 * SH) / SW)) * 1000 };
  const prompt = pointPrompt(c.question, cursor, undefined, true, false) + (ZOOM_VARIANT ? ZOOM_RULE : '');
  const drawn: Mark[] = [];
  const registry = new ToolRegistry().registerAll(
    createOverlayTools({
      normalized: true,
      frame: () => ({ imageW: 1366, imageH: Math.round((1366 * SH) / SW), x: 0, y: 0, w: SW, h: SH }),
      draw: () => {},
      clear: () => {},
    }),
  );
  const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
  const backend = new DirectProviderBackend(model);
  const t0 = Date.now();
  let text = '';
  for await (const ev of backend.run({
    system: "Sei Remi, un assistente che vede lo schermo dell'utente. Rispondi in italiano.",
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.flatMap((i) => [
            { type: 'text' as const, text: i.label },
            { type: 'image' as const, image: i.data, mediaType: 'image/png' },
          ]),
        ],
      },
    ],
    tools: registry.toAiToolSet(ctx, policy),
    budget: { maxSteps: 2, wallClockMs: 90_000 },
    fast: true,
    finalTools: ['overlay.draw', 'overlay.clear'].map(wireName),
  })) {
    if (ev.type === 'text-delta') text += ev.text;
    if (ev.type === 'tool-call' && ev.toolName === wireName('overlay.draw')) {
      const items = ((ev.input as { items?: unknown[] })?.items ?? []) as Record<string, unknown>[];
      for (const it of items) {
        const label = String(it.text ?? it.label ?? '');
        const [x, y] = [Number(it.x), Number(it.y)];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const [w, h] = [Number(it.w ?? 0) || 0, Number(it.h ?? 0) || 0];
        drawn.push({ label, x, y, w, h, zoom: it.in === 'zoom', from: 'overlay' });
      }
    }
  }
  return { marks: [...textMarks(text), ...drawn], ms: Date.now() - t0, text };
}

const rows: { id: string; part: string; dist: number; label: string; zoom: boolean }[] = [];
let named = 0;
let unnamed = 0;
const jobs = cases.flatMap((c) => Array.from({ length: RUNS }, () => c));
// un errore non deve mai stampare la chiave (finisce negli header e nei messaggi dell'SDK)
const safe = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/Bearer\s+\S+|vck_\w+/g, '***').slice(0, 160);
const results = await Promise.all(
  jobs.map((c) =>
    runCase(c)
      .then((r) => ({ c, r }))
      .catch((err) => ({ c, r: { marks: [] as Mark[], ms: 0, text: `ERRORE ${safe(err)}` } })),
  ),
);
for (const { c, r } of results) {
  for (const m of r.marks) {
    const part = c.parts.find((p) => new RegExp(p.re, 'i').test(m.label));
    if (!part) {
      unnamed += 1;
      continue;
    }
    named += 1;
    rows.push({ id: c.id, part: part.name, dist: Math.round(distance(toScreen(m, c), part)), label: m.label, zoom: Boolean(m.zoom) });
  }
  const err = r.text.startsWith('ERRORE') ? ` ${r.text}` : '';
  console.log(`${c.id.padEnd(9)} ${String(r.ms).padStart(6)} ms  segni: ${r.marks.map((m) => `${m.label}${m.zoom ? '[zoom]' : ''}`).join(' · ') || '—'}${err}`);
}
const hits = rows.filter((r) => r.dist === 0).length;
const near = rows.filter((r) => r.dist <= 15).length;
const sorted = rows.map((r) => r.dist).sort((a, b) => a - b);
console.log(`\nmodello ${MODEL}, ${RUNS} ripetizioni${ZOOM_VARIANT ? ', variante in="zoom"' : ''}`);
console.log(`segni in coordinate dell'ingrandimento: ${rows.filter((r) => r.zoom).length}/${rows.length}`);
console.log(`segni su parti note: ${named} (altri senza parte da verificare: ${unnamed})`);
console.log(`centrati sulla parte: ${hits}/${named} (${Math.round((hits / Math.max(1, named)) * 100)}%), entro 15 pt: ${near}/${named}`);
console.log(`distanza mediana ${sorted[Math.floor(sorted.length / 2)] ?? '-'} pt, peggiore ${sorted.at(-1) ?? '-'} pt`);
const byPart = new Map<string, number[]>();
for (const r of rows) byPart.set(`${r.id}/${r.part}`, [...(byPart.get(`${r.id}/${r.part}`) ?? []), r.dist]);
for (const [k, d] of byPart) console.log(`  ${k.padEnd(26)} ${d.map((v) => (v === 0 ? '✓' : `✗${v}`)).join(' ')}`);
