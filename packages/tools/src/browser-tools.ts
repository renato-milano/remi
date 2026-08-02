import type { BrowserSession, PageSnapshot } from '@openmate/browser';
import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

/** Riduce lo snapshot a un payload testuale compatto per il modello. */
function fmt(snap: PageSnapshot) {
  return {
    url: snap.url,
    title: snap.title,
    elements: snap.elements, // [{ref, role, name, value?}] → clicca/scrivi per ref
    text: snap.text.slice(0, 1500),
  };
}

/**
 * Tool `browser.*` su Playwright (sessione autonoma). Snapshot testuale del DOM
 * → funziona anche con modelli SENZA vision: il modello vede url/titolo + una
 * lista numerata di elementi (ref) e agisce per ref. Guardare/leggere è gratis;
 * cliccare/scrivere passa dal gate di sessione 'browser'.
 */
export function createBrowserTools(session: BrowserSession): Tool[] {
  const open = defineTool({
    name: 'browser.open',
    description:
      'Apre una pagina nel browser: accetta un URL completo, un dominio, o testo libero (→ ricerca Google). Restituisce titolo, elementi interattivi (con ref) e un estratto del testo.',
    parameters: z.object({ url: z.string() }),
    permission: 'guarded',
    explain: (i) => ({ text: `aprire nel browser: ${i.url.slice(0, 50)}`, level: 'network', known: true }),
    execute: async (i) => fmt(await session.open(i.url)),
  });

  const snapshot = defineTool({
    name: 'browser.snapshot',
    description: 'Rilegge la pagina corrente: titolo, elementi interattivi (ref) e testo. Usalo per vedere lo stato dopo un\'azione.',
    parameters: z.object({}),
    permission: 'guarded',
    explain: () => ({ text: 'guardare la pagina web', level: 'read', known: true }),
    execute: async () => fmt(await session.snapshot()),
  });

  const read = defineTool({
    name: 'browser.read',
    description: 'Restituisce il testo completo (leggibile) della pagina corrente, per leggere/estrarre contenuti.',
    parameters: z.object({}),
    permission: 'guarded',
    explain: () => ({ text: 'leggere la pagina web', level: 'read', known: true }),
    execute: async () => ({ text: await session.read() }),
  });

  const click = defineTool({
    name: 'browser.click',
    description: 'Clicca l\'elemento con il dato ref (dallo snapshot). Restituisce il nuovo snapshot.',
    parameters: z.object({ ref: z.number().int().min(0) }),
    permission: 'dangerous',
    explain: () => ({ text: 'cliccare nella pagina web', level: 'dangerous', known: true }),
    execute: async (i) => fmt(await session.click(i.ref)),
  });

  const type = defineTool({
    name: 'browser.type',
    description:
      'Scrive del testo nel campo con il dato ref. submit:true preme Invio (per cercare/inviare). Restituisce il nuovo snapshot.',
    parameters: z.object({ ref: z.number().int().min(0), text: z.string(), submit: z.boolean().optional() }),
    permission: 'dangerous',
    explain: () => ({ text: 'scrivere nella pagina web', level: 'dangerous', known: true }),
    execute: async (i) => fmt(await session.type(i.ref, i.text, i.submit ?? false)),
  });

  const back = defineTool({
    name: 'browser.back',
    description: 'Torna alla pagina precedente. Restituisce il nuovo snapshot.',
    parameters: z.object({}),
    permission: 'guarded',
    explain: () => ({ text: 'tornare indietro nel browser', level: 'read', known: true }),
    execute: async () => fmt(await session.back()),
  });

  return [open, snapshot, read, click, type, back];
}
