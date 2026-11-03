import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

/**
 * Geometria dell'ultima immagine dello schermo vista dal modello: dimensioni in
 * pixel dell'immagine e rettangolo del monitor catturato in coordinate logiche
 * globali (punti, origine del desktop). Serve a convertire le coordinate che il
 * modello legge nell'immagine in posizioni reali sullo schermo.
 */
export interface ScreenFrame {
  imageW: number;
  imageH: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Elemento da disegnare, già in coordinate logiche globali. */
export interface OverlayItem {
  type: 'point' | 'highlight' | 'label' | 'note';
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
}

/** Estensione degli assi nelle coordinate normalizzate. */
export const NORMALIZED = 1000;

export interface OverlayOptions {
  /** Il modello usa coordinate normalizzate 0-1000 invece dei pixel dello screenshot. */
  normalized?: boolean;
  /** Ultima immagine dello schermo vista dal modello (undefined se nessuna). */
  frame: () => ScreenFrame | undefined;
  /** Invia gli elementi all'interfaccia (finestra overlay). */
  draw: (items: OverlayItem[], clear: boolean) => void;
  clear: () => void;
}

/**
 * Converte un elemento dalle coordinate del modello a quelle logiche globali.
 * `normalized`: il modello ragiona in 0-1000 su entrambi gli assi (così sono
 * addestrati i Gemini: misurato, errore ~2 px contro ~300 px chiedendo i pixel);
 * altrimenti sono pixel dell'immagine.
 */
export function toScreen(item: OverlayItem, f: ScreenFrame, normalized = false): OverlayItem {
  const spanW = normalized ? NORMALIZED : f.imageW;
  const spanH = normalized ? NORMALIZED : f.imageH;
  const sx = spanW > 0 ? f.w / spanW : 1;
  const sy = spanH > 0 ? f.h / spanH : 1;
  const out: OverlayItem = {
    type: item.type,
    x: Math.round(f.x + item.x * sx),
    y: Math.round(f.y + item.y * sy),
  };
  if (item.w !== undefined) out.w = Math.round(item.w * sx);
  if (item.h !== undefined) out.h = Math.round(item.h * sy);
  if (item.text) out.text = item.text;
  return out;
}

/**
 * Tool `overlay.*`: l'agente disegna SOPRA lo schermo dell'utente (indicatori,
 * riquadri, etichette, post-it) per spiegare mentre parla. Solo visualizzazione:
 * non tocca mouse né tastiera, quindi nessun permesso. Un solo tool per molti
 * elementi: ogni chiamata è un passo del modello, e la latenza conta.
 */
export function createOverlayTools(opts: OverlayOptions): Tool[] {
  const unit = opts.normalized
    ? "coordinate NORMALIZZATE 0-1000 sull'ultimo screenshot (x da sinistra, y dall'alto)"
    : "pixel dell'ultimo screenshot";
  const item = z.object({
    type: z
      .enum(['point', 'highlight', 'label', 'note'])
      .describe(
        "point = indicatore animato su un punto; highlight = riquadro attorno a un'area (serve w,h); label = etichetta breve attaccata a un punto; note = post-it con un avviso o un consiglio",
      ),
    x: z.number().describe(`x in ${unit} (per highlight: angolo in alto a sinistra)`),
    y: z.number().describe(`y in ${unit}`),
    w: z.number().optional().describe('larghezza (solo highlight)'),
    h: z.number().optional().describe('altezza (solo highlight)'),
    text: z.string().optional().describe('testo: 1-4 parole per label/highlight, una frase breve per note'),
  });

  const draw = defineTool({
    name: 'overlay.draw',
    description:
      "Disegna sopra lo schermo dell'utente per mostrargli le cose mentre spieghi: indicatori, riquadri, etichette, post-it. " +
      `Le coordinate sono in ${unit}. Passa tutti gli elementi in UNA chiamata. ` +
      'Per default sostituisce quanto disegnato prima.',
    parameters: z.object({
      items: z.array(item).min(1).max(12),
      keep: z.boolean().optional().describe('true = aggiungi a quanto già disegnato invece di sostituirlo'),
      answer: z
        .string()
        .optional()
        .describe(
          "la tua risposta all'utente (1-3 frasi), mostrata insieme ai disegni: se la scrivi qui non ripeterla fuori",
        ),
    }),
    permission: 'safe',
    explain: () => ({ text: 'disegnare indicazioni sullo schermo', level: 'read', known: true }),
    execute: async (i) => {
      const f = opts.frame();
      if (!f) return { ok: false, error: 'Non ho ancora visto lo schermo: serve prima uno screenshot.' };
      opts.draw(
        i.items.map((it) => toScreen(it, f, opts.normalized)),
        !i.keep,
      );
      return { ok: true, drawn: i.items.length };
    },
  });

  const clear = defineTool({
    name: 'overlay.clear',
    description: 'Cancella tutto ciò che hai disegnato sullo schermo.',
    parameters: z.object({ note: z.string().optional().describe('facoltativo, ignorato') }),
    permission: 'safe',
    explain: () => ({
      text: 'cancellare le indicazioni sullo schermo',
      level: 'read',
      known: true,
    }),
    execute: async () => {
      opts.clear();
      return { ok: true };
    },
  });

  return [draw, clear];
}
