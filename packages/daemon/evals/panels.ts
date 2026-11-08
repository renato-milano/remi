/**
 * Banco delle lavagne: che disegno fa il modello per spiegare un argomento?
 *
 * Per ogni domanda manda il prompt vero dei turni "indica" (con uno screenshot neutro) e salva
 * il pannello ricevuto nello stesso formato dei dump di debug (`panel-*.json`), da disegnare
 * col banco di prova della lavagna e guardare a occhio. Nessun punteggio automatico: la
 * domanda è se il disegno mostra la forma vera della cosa o solo riquadri col suo nome.
 *
 *   SHOT=<png 1366 px> OUT=<cartella> OPENMATE_API_KEY=… npx tsx evals/panels.ts [ripetizioni] [id,id…]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PanelStream, type PanelStreamStep } from '@openmate/core';
import { DirectProviderBackend, createProvider } from '@openmate/llm';
import { pointPrompt } from '../src/daemon.js';

const CASES: { id: string; question: string }[] = [
  { id: 'neurale', question: 'Come funziona una rete neurale?' },
  { id: 'gradiente', question: 'Cosa vuol dire discesa del gradiente?' },
  { id: 'quicksort', question: 'Come funziona il quicksort?' },
  { id: 'interesse', question: "Perché l'interesse composto fa crescere così tanto i soldi?" },
  { id: 'suono', question: "Come viaggia il suono nell'aria?" },
  { id: 'dns', question: 'Cosa succede quando scrivo un indirizzo nel browser?' },
  { id: 'bst', question: 'Come fa un albero binario di ricerca a trovare un numero?' },
  { id: 'cuore', question: 'Come pompa il sangue il cuore?' },
];

const RUNS = Number(process.argv[2] ?? 1);
const ONLY = process.argv[3]?.split(',');
const OUT = process.env.OUT ?? '.';
const MODEL = process.env.MODEL ?? 'google/gemini-3.8-flash';
const shot = readFileSync(process.env.SHOT ?? 'shot.png').toString('base64');
const model = createProvider({
  name: 'openai-compatible',
  baseURL: 'https://ai-gateway.vercel.sh/v1',
  apiKey: process.env.OPENMATE_API_KEY,
}).languageModel(MODEL);
// un errore non deve mai stampare la chiave
const safe = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/Bearer\s+\S+|vck_\w+/g, '***').slice(0, 160);

async function runCase(question: string) {
  const prompt = pointPrompt(question, { x: 500, y: 500 }, undefined, true, false);
  const panel = new PanelStream();
  const dump: { title?: string; rows?: number; cols?: number; ownColors?: boolean; steps: PanelStreamStep[] } = { steps: [] };
  const take = ({ events }: ReturnType<PanelStream['feed']>) => {
    for (const e of events) {
      if (e.op === 'start') Object.assign(dump, { title: e.title, rows: e.rows, cols: e.cols, ownColors: e.ownColors });
      else if (e.op === 'step') dump.steps.push({ index: e.index, say: e.say, svg: e.svg, marks: e.marks });
    }
  };
  const t0 = Date.now();
  let text = '';
  for await (const ev of new DirectProviderBackend(model).run({
    system: "Sei Remi, un assistente che vede lo schermo dell'utente. Rispondi in italiano.",
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image', image: shot, mediaType: 'image/png' },
        ],
      },
    ],
    budget: { maxSteps: 1, wallClockMs: 120_000 },
    fast: true,
  })) {
    if (ev.type === 'text-delta') {
      text += ev.text;
      take(panel.feed(ev.text));
    }
  }
  take(panel.end());
  return { dump, ms: Date.now() - t0, chars: text.length };
}

mkdirSync(OUT, { recursive: true });
const jobs = CASES.filter((c) => !ONLY || ONLY.includes(c.id)).flatMap((c) => Array.from({ length: RUNS }, (_, r) => ({ ...c, r })));
await Promise.all(
  jobs.map(async (c) => {
    try {
      const { dump, ms, chars } = await runCase(c.question);
      writeFileSync(join(OUT, `${c.id}-${c.r}.json`), JSON.stringify(dump, null, 1));
      console.log(`${c.id}-${c.r}`.padEnd(13), `${String(ms).padStart(6)} ms  ${String(chars).padStart(5)} car  ${dump.steps.length} passi  «${dump.title ?? '—'}»`);
    } catch (err) {
      console.log(`${c.id}-${c.r}`.padEnd(13), 'ERRORE', safe(err));
    }
  }),
);
