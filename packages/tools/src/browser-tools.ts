import type { BrowserEngine, PageSnapshot } from '@openmate/browser';
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
export function createBrowserTools(session: BrowserEngine): Tool[] {
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

  const scroll = defineTool({
    name: 'browser.scroll',
    description: 'Scorre la pagina per rivelare altro contenuto (amount>0 = giù, <0 = su). Restituisce il nuovo snapshot.',
    parameters: z.object({ amount: z.number().default(600) }),
    permission: 'guarded',
    explain: () => ({ text: 'scorrere la pagina web', level: 'read', known: true }),
    execute: async (i) => fmt(await session.scroll(i.amount ?? 600)),
  });

  const wait = defineTool({
    name: 'browser.wait',
    description:
      'Attende che compaia un testo (text) oppure qualche secondo (seconds), utile con pagine dinamiche che caricano dopo. Poi restituisce lo snapshot.',
    parameters: z.object({ text: z.string().optional(), seconds: z.number().min(0).max(30).optional() }),
    permission: 'guarded',
    explain: () => ({ text: 'attendere il caricamento della pagina', level: 'read', known: true }),
    execute: async (i) => fmt(await session.waitFor({ text: i.text, seconds: i.seconds })),
  });

  const key = defineTool({
    name: 'browser.key',
    description: 'Preme un tasto sulla pagina, es. "Enter", "Escape", "Tab", "PageDown". Restituisce il nuovo snapshot.',
    parameters: z.object({ key: z.string() }),
    permission: 'dangerous',
    explain: () => ({ text: 'premere un tasto nel browser', level: 'dangerous', known: true }),
    execute: async (i) => fmt(await session.key(i.key)),
  });

  const select = defineTool({
    name: 'browser.select',
    description: 'Sceglie un valore in un menu a tendina (<select>) dato il suo ref. Restituisce il nuovo snapshot.',
    parameters: z.object({ ref: z.number().int().min(0), value: z.string() }),
    permission: 'dangerous',
    explain: () => ({ text: 'scegliere un\'opzione nel browser', level: 'dangerous', known: true }),
    execute: async (i) => fmt(await session.select(i.ref, i.value)),
  });

  const tabs = defineTool({
    name: 'browser.tabs',
    description: 'Elenca le schede aperte (indice, titolo, url, quale è attiva).',
    parameters: z.object({}),
    permission: 'guarded',
    explain: () => ({ text: 'elencare le schede del browser', level: 'read', known: true }),
    execute: async () => ({ tabs: await session.tabs() }),
  });

  const newTab = defineTool({
    name: 'browser.new_tab',
    description: 'Apre una NUOVA scheda e ci naviga (URL, dominio o ricerca). Restituisce lo snapshot della nuova scheda.',
    parameters: z.object({ url: z.string() }),
    permission: 'guarded',
    explain: (i) => ({ text: `aprire una nuova scheda: ${i.url.slice(0, 50)}`, level: 'network', known: true }),
    execute: async (i) => fmt(await session.newTab(i.url)),
  });

  const selectTab = defineTool({
    name: 'browser.select_tab',
    description: 'Passa alla scheda con l\'indice dato (da browser.tabs). Restituisce il suo snapshot.',
    parameters: z.object({ index: z.number().int().min(0) }),
    permission: 'guarded',
    explain: () => ({ text: 'cambiare scheda nel browser', level: 'read', known: true }),
    execute: async (i) => fmt(await session.selectTab(i.index)),
  });

  return [open, snapshot, read, click, type, back, scroll, wait, key, select, tabs, newTab, selectTab];
}
