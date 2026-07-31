import type { Executor } from '@openmate/computer';
import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

/** Mappa l'output (screenshot) a content-parts per il modello (immagine). */
function imageOutput(output: unknown): unknown {
  const o = output as { screenshot?: string; width?: number; height?: number; denied?: boolean };
  if (!o?.screenshot) {
    return { type: 'content', value: [{ type: 'text', text: o?.denied ? 'azione negata' : 'ok' }] };
  }
  return {
    type: 'content',
    value: [
      { type: 'text', text: `Ecco lo schermo (${o.width}x${o.height}). Le coordinate sono in questi pixel.` },
      { type: 'file', mediaType: 'image/png', data: o.screenshot },
    ],
  };
}

/**
 * Tool `computer.*` (vision-only, cross-platform via l'executor). Ogni azione
 * restituisce un nuovo screenshot così il modello vede l'esito. Tutti passano
 * dal gate di sessione (approvazione una volta per ciclo — vedi executeGated).
 */
export function createComputerTools(executor: Executor): Tool[] {
  const shot = async () => {
    const s = await executor.screenshot();
    return { screenshot: s.pngBase64, width: s.width, height: s.height };
  };

  const screenshot = defineTool({
    name: 'computer.screenshot',
    description: 'Cattura uno screenshot dello schermo per vedere cosa c’è.',
    parameters: z.object({}),
    permission: 'guarded',
    explain: () => ({ text: 'guardare lo schermo', level: 'read', known: true }),
    toModelOutput: imageOutput,
    execute: async () => shot(),
  });

  const move = defineTool({
    name: 'computer.move',
    description: 'Sposta il puntatore a (x,y) nei pixel dell’ultimo screenshot. Restituisce un nuovo screenshot.',
    parameters: z.object({ x: z.number(), y: z.number() }),
    permission: 'dangerous',
    explain: () => ({ text: 'muovere il puntatore', level: 'dangerous', known: true }),
    toModelOutput: imageOutput,
    execute: async (i) => {
      await executor.move(i.x, i.y);
      return shot();
    },
  });

  const click = defineTool({
    name: 'computer.click',
    description: 'Clicca a (x,y) nei pixel dell’ultimo screenshot. Restituisce un nuovo screenshot.',
    parameters: z.object({ x: z.number(), y: z.number(), button: z.enum(['left', 'right', 'middle']).optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'cliccare sullo schermo', level: 'dangerous', known: true }),
    toModelOutput: imageOutput,
    execute: async (i) => {
      await executor.click(i.x, i.y, i.button);
      return shot();
    },
  });

  const doubleClick = defineTool({
    name: 'computer.double_click',
    description: 'Doppio click a (x,y). Restituisce un nuovo screenshot.',
    parameters: z.object({ x: z.number(), y: z.number(), button: z.enum(['left', 'right', 'middle']).optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'fare doppio click sullo schermo', level: 'dangerous', known: true }),
    toModelOutput: imageOutput,
    execute: async (i) => {
      await executor.doubleClick(i.x, i.y, i.button);
      return shot();
    },
  });

  const type = defineTool({
    name: 'computer.type',
    description: 'Digita del testo con la tastiera. Restituisce un nuovo screenshot.',
    parameters: z.object({ text: z.string() }),
    permission: 'dangerous',
    explain: () => ({ text: 'digitare del testo', level: 'dangerous', known: true }),
    toModelOutput: imageOutput,
    execute: async (i) => {
      await executor.type(i.text);
      return shot();
    },
  });

  const key = defineTool({
    name: 'computer.key',
    description: 'Premi una combinazione di tasti, es. ["cmd","space"]. Restituisce un nuovo screenshot.',
    parameters: z.object({ keys: z.array(z.string()).min(1) }),
    permission: 'dangerous',
    explain: () => ({ text: 'premere dei tasti', level: 'dangerous', known: true }),
    toModelOutput: imageOutput,
    execute: async (i) => {
      await executor.key(i.keys);
      return shot();
    },
  });

  const scroll = defineTool({
    name: 'computer.scroll',
    description: 'Scorre (dx orizzontale, dy verticale). Restituisce un nuovo screenshot.',
    parameters: z.object({ dx: z.number().default(0), dy: z.number().default(0) }),
    permission: 'dangerous',
    explain: () => ({ text: 'scorrere lo schermo', level: 'dangerous', known: true }),
    toModelOutput: imageOutput,
    execute: async (i) => {
      await executor.scroll(i.dx ?? 0, i.dy ?? 0);
      return shot();
    },
  });

  return [screenshot, move, click, doubleClick, type, key, scroll];
}
