import type { Executor, Screenshot } from '@openmate/computer';
import { z } from 'zod';
import { NORMALIZED } from './overlay-tools.js';
import { type Tool, type ToolContext, defineTool } from './types.js';

export interface ComputerToolsOptions {
  onShot?: (shot: Screenshot) => void;
  /** Il modello usa coordinate normalizzate 0-1000 invece dei pixel dello screenshot (Gemini). */
  normalized?: boolean;
  /** Attesa dopo un'azione prima dello screenshot, perché l'interfaccia reagisca (ms). */
  settleMs?: number;
}

/** Senza attesa lo screenshot mostra lo schermo di prima e il modello ripete il clic. */
const SETTLE_MS = 600;
/** Stessa azione di fila: alla seconda si avvisa il modello, alla terza non si esegue. */
const REPEAT_WARN = 2;
const REPEAT_STOP = 3;
const NAV_KEYS = new Set(['up', 'down', 'left', 'right', 'tab', 'pageup', 'pagedown', 'backspace', 'delete']);

/**
 * Tool `computer.*` (vision-only, cross-platform via l'executor). Ogni azione
 * cattura un nuovo screenshot e lo rende visibile al modello via ctx.emitImage
 * (iniettato come user message — i tool result non trasportano immagini su
 * molti provider). Il risultato del tool è un testo leggero. Tutti passano dal
 * gate di sessione (approvazione una volta per ciclo — vedi executeGated).
 */
export function createComputerTools(executor: Executor, opts: ComputerToolsOptions = {}): Tool[] {
  let last: Screenshot | undefined;
  const capture = async (ctx: ToolContext) => {
    const s = await executor.screenshot();
    last = s;
    opts.onShot?.(s); // es. l'overlay disegna nello spazio dell'ultimo screenshot
    ctx.emitImage?.(s.pngBase64);
    return { ok: true, width: s.width, height: s.height };
  };

  // nota: schema con un campo opzionale (non vuoto) → l'input è sempre un oggetto,
  // così Anthropic non rifiuta il tool_use ("Input should be a valid dictionary").
  const unit = opts.normalized
    ? "coordinate NORMALIZZATE 0-1000 sull'ultimo screenshot (x da sinistra, y dall'alto)"
    : "pixel dell'ultimo screenshot";
  /** Dalle coordinate del modello ai pixel dell'ultimo screenshot (lo spazio dell'executor). */
  const toPixels = (x: number, y: number): { x: number; y: number } | undefined => {
    if (!opts.normalized) return { x, y };
    if (!last) return undefined;
    return { x: Math.round((x / NORMALIZED) * last.width), y: Math.round((y / NORMALIZED) * last.height) };
  };
  const noShot = { ok: false, error: 'Non ho ancora visto lo schermo: fai prima computer.screenshot.' };
  const settleMs = opts.settleMs ?? SETTLE_MS;
  // stesso clic nello stesso punto (entro ~1% dello schermo) = stessa azione
  const near = opts.normalized ? 12 : 16;
  const repeat = { sig: '', at: undefined as { x: number; y: number } | undefined, count: 0 };

  /**
   * Conta le azioni identiche di fila (guardare non interrompe la serie). Restituisce un errore
   * se la stessa azione è già stata ripetuta troppe volte: lo schermo evidentemente non cambia.
   */
  const checkRepeat = (sig: string, at?: { x: number; y: number }) => {
    const same =
      sig === repeat.sig &&
      (!at || (repeat.at && Math.abs(at.x - repeat.at.x) <= near && Math.abs(at.y - repeat.at.y) <= near));
    repeat.count = same ? repeat.count + 1 : 1;
    repeat.sig = sig;
    repeat.at = at;
    if (repeat.count >= REPEAT_STOP) {
      return {
        ok: false,
        error: `Non eseguita: è la ${repeat.count}ª volta di fila che fai la stessa azione e lo schermo non cambia. Cambia strada (computer.list_elements, una scorciatoia, un deep-link) oppure di' all'utente cosa non riesci a fare.`,
      };
    }
    return undefined;
  };
  /** Dopo l'azione: attende che l'interfaccia reagisca, poi guarda; avvisa se l'azione si sta ripetendo. */
  const after = async (ctx: ToolContext) => {
    if (settleMs > 0) await new Promise((r) => setTimeout(r, settleMs));
    const out = await capture(ctx);
    if (repeat.count >= REPEAT_WARN) {
      return {
        ...out,
        warning:
          'Hai appena ripetuto la stessa azione: controlla sullo screenshot se ha avuto effetto prima di rifarla.',
      };
    }
    return out;
  };
  const point = z.object({ x: z.number(), y: z.number() });

  const noArgs = z.object({ note: z.string().optional().describe('facoltativo, ignorato') });

  const screenshot = defineTool({
    name: 'computer.screenshot',
    description: 'Cattura uno screenshot dello schermo per vedere cosa c’è. Lo vedrai nel messaggio successivo.',
    parameters: noArgs,
    permission: 'guarded',
    explain: () => ({ text: 'guardare lo schermo', level: 'read', known: true }),
    execute: async (_i, ctx) => capture(ctx),
  });

  const wait = defineTool({
    name: 'computer.wait',
    description:
      'Aspetta qualche secondo (es. mentre un’app si carica o si apre) e restituisce un nuovo screenshot. Usalo dopo aver aperto un’app, prima di interagire.',
    parameters: z.object({ seconds: z.number().min(0).max(10).default(2) }),
    permission: 'guarded',
    explain: () => ({ text: 'aspettare qualche secondo', level: 'read', known: true }),
    execute: async (i, ctx) => {
      await new Promise((r) => setTimeout(r, Math.round((i.seconds ?? 2) * 1000)));
      return capture(ctx);
    },
  });

  const move = defineTool({
    name: 'computer.move',
    description: `Sposta il puntatore a (x,y), in ${unit}.`,
    parameters: point,
    permission: 'dangerous',
    explain: () => ({ text: 'muovere il puntatore', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      const p = toPixels(i.x, i.y);
      if (!p) return noShot;
      const stop = checkRepeat('move', i);
      if (stop) return stop;
      await executor.move(p.x, p.y);
      return after(ctx);
    },
  });

  const click = defineTool({
    name: 'computer.click',
    description: `Clicca a (x,y), in ${unit}.`,
    parameters: point.extend({ button: z.enum(['left', 'right', 'middle']).optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'cliccare sullo schermo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      const p = toPixels(i.x, i.y);
      if (!p) return noShot;
      const stop = checkRepeat(`click:${i.button ?? 'left'}`, i);
      if (stop) return stop;
      await executor.click(p.x, p.y, i.button);
      return after(ctx);
    },
  });

  const doubleClick = defineTool({
    name: 'computer.double_click',
    description: `Doppio click a (x,y), in ${unit}.`,
    parameters: point.extend({ button: z.enum(['left', 'right', 'middle']).optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'fare doppio click sullo schermo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      const p = toPixels(i.x, i.y);
      if (!p) return noShot;
      const stop = checkRepeat(`double:${i.button ?? 'left'}`, i);
      if (stop) return stop;
      await executor.doubleClick(p.x, p.y, i.button);
      return after(ctx);
    },
  });

  const type = defineTool({
    name: 'computer.type',
    description: 'Digita del testo con la tastiera.',
    parameters: z.object({ text: z.string() }),
    permission: 'dangerous',
    explain: () => ({ text: 'digitare del testo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      const stop = checkRepeat(`type:${i.text}`);
      if (stop) return stop;
      await executor.type(i.text);
      return after(ctx);
    },
  });

  const key = defineTool({
    name: 'computer.key',
    description: 'Premi una combinazione di tasti, es. ["cmd","space"].',
    parameters: z.object({ keys: z.array(z.string()).min(1) }),
    permission: 'dangerous',
    explain: () => ({ text: 'premere dei tasti', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      // frecce, Tab e simili si premono più volte di fila per muoversi: non contano come ripetizione
      if (i.keys.length === 1 && NAV_KEYS.has(i.keys[0].toLowerCase())) {
        Object.assign(repeat, { sig: '', at: undefined, count: 0 });
      } else {
        const stop = checkRepeat(`key:${i.keys.join('+')}`);
        if (stop) return stop;
      }
      await executor.key(i.keys);
      return after(ctx);
    },
  });

  const scroll = defineTool({
    name: 'computer.scroll',
    description: 'Scorre (dx orizzontale, dy verticale).',
    parameters: z.object({ dx: z.number().default(0), dy: z.number().default(0) }),
    permission: 'dangerous',
    explain: () => ({ text: 'scorrere lo schermo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      await executor.scroll(i.dx ?? 0, i.dy ?? 0);
      Object.assign(repeat, { sig: '', at: undefined, count: 0 }); // scorrere più volte è normale: interrompe la serie
      return after(ctx);
    },
  });

  const listElements = defineTool({
    name: 'computer.list_elements',
    description:
      'Elenca gli elementi cliccabili della finestra attiva (pulsanti, campi…) con un indice. Poi usa computer.click_element(index) per cliccarli con precisione, invece di indovinare le coordinate.',
    parameters: noArgs,
    permission: 'guarded',
    explain: () => ({ text: 'leggere gli elementi sullo schermo', level: 'read', known: true }),
    execute: async (_i, ctx) => {
      const els = await executor.describeUi();
      await capture(ctx); // manda anche lo screenshot aggiornato
      return {
        count: els.length,
        elements: els.map((e, i) => ({ index: i, role: e.role, name: e.name })),
        hint: els.length
          ? 'Usa computer.click_element({index}) per cliccare uno di questi.'
          : 'Nessun elemento accessibile trovato (app senza albero AX): usa il click a coordinate guardando lo screenshot.',
      };
    },
  });

  const clickElement = defineTool({
    name: 'computer.click_element',
    description: 'Clicca l’elemento all’indice ottenuto da computer.list_elements (click preciso).',
    parameters: z.object({ index: z.number().int().min(0) }),
    permission: 'dangerous',
    explain: () => ({
      text: 'cliccare un elemento sullo schermo',
      level: 'dangerous',
      known: true,
    }),
    execute: async (i, ctx) => {
      const stop = checkRepeat(`element:${i.index}`);
      if (stop) return stop;
      await executor.clickElement(i.index);
      return after(ctx);
    },
  });

  return [
    screenshot,
    wait,
    listElements,
    clickElement,
    move,
    click,
    doubleClick,
    type,
    key,
    scroll,
  ];
}
