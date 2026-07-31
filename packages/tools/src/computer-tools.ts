import type { Executor } from '@openmate/computer';
import { z } from 'zod';
import { type Tool, type ToolContext, defineTool } from './types.js';

/**
 * Tool `computer.*` (vision-only, cross-platform via l'executor). Ogni azione
 * cattura un nuovo screenshot e lo rende visibile al modello via ctx.emitImage
 * (iniettato come user message — i tool result non trasportano immagini su
 * molti provider). Il risultato del tool è un testo leggero. Tutti passano dal
 * gate di sessione (approvazione una volta per ciclo — vedi executeGated).
 */
export function createComputerTools(executor: Executor): Tool[] {
  const capture = async (ctx: ToolContext) => {
    const s = await executor.screenshot();
    ctx.emitImage?.(s.pngBase64);
    return { ok: true, width: s.width, height: s.height };
  };

  const screenshot = defineTool({
    name: 'computer.screenshot',
    description: 'Cattura uno screenshot dello schermo per vedere cosa c’è. Lo vedrai nel messaggio successivo.',
    parameters: z.object({}),
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
    description: 'Sposta il puntatore a (x,y) nei pixel dell’ultimo screenshot.',
    parameters: z.object({ x: z.number(), y: z.number() }),
    permission: 'dangerous',
    explain: () => ({ text: 'muovere il puntatore', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      await executor.move(i.x, i.y);
      return capture(ctx);
    },
  });

  const click = defineTool({
    name: 'computer.click',
    description: 'Clicca a (x,y) nei pixel dell’ultimo screenshot.',
    parameters: z.object({ x: z.number(), y: z.number(), button: z.enum(['left', 'right', 'middle']).optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'cliccare sullo schermo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      await executor.click(i.x, i.y, i.button);
      return capture(ctx);
    },
  });

  const doubleClick = defineTool({
    name: 'computer.double_click',
    description: 'Doppio click a (x,y).',
    parameters: z.object({ x: z.number(), y: z.number(), button: z.enum(['left', 'right', 'middle']).optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'fare doppio click sullo schermo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      await executor.doubleClick(i.x, i.y, i.button);
      return capture(ctx);
    },
  });

  const type = defineTool({
    name: 'computer.type',
    description: 'Digita del testo con la tastiera.',
    parameters: z.object({ text: z.string() }),
    permission: 'dangerous',
    explain: () => ({ text: 'digitare del testo', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      await executor.type(i.text);
      return capture(ctx);
    },
  });

  const key = defineTool({
    name: 'computer.key',
    description: 'Premi una combinazione di tasti, es. ["cmd","space"].',
    parameters: z.object({ keys: z.array(z.string()).min(1) }),
    permission: 'dangerous',
    explain: () => ({ text: 'premere dei tasti', level: 'dangerous', known: true }),
    execute: async (i, ctx) => {
      await executor.key(i.keys);
      return capture(ctx);
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
      return capture(ctx);
    },
  });

  return [screenshot, wait, move, click, doubleClick, type, key, scroll];
}
