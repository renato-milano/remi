// Prova la finestra del quaderno in Chrome con un archivio finto: argomenti, filtri, dettaglio, azioni.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const now = Date.now();
const entries = [
  { id: 'a', at: now - 1000, title: 'Come funziona un Transformer', topic: 'Come funzionano gli LLM', kinds: ['panel'], steps: 2,
    sentences: ['Ogni token diventa un vettore.', 'L’attenzione pesa gli altri token.'], question: 'Come funziona un Transformer?', voiced: true },
  { id: 'b', at: now - 2000, title: 'Perché la softmax somma a uno?', topic: 'Come funzionano gli LLM', kinds: ['answer'],
    question: 'Perché la softmax somma a uno?', onBoard: 'Come funziona un Transformer', answer: 'Divide per la somma.', sentences: ['Divide per la somma.'] },
  { id: 'c', at: now - 3 * 86_400_000, title: 'Tiro a giro', topic: 'Fisica del calcio', kinds: ['motion'], parts: 4, duration: 3, answer: 'Il piede colpisce di lato.' },
  { id: 'd', at: now - 3000, title: 'Drone DJI Neo', topic: null, kinds: ['scene'], parts: 18 },
];
const calls = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('record', (c) => calls.push(c));
  await page.addInitScript((entries) => {
    const topics = [...new Set(entries.map((e) => e.topic).filter(Boolean))];
    window.notebook = {
      list: async () => ({ entries, topics }),
      get: async () => null,
      update: async (id, patch) => window.record({ op: 'update', id, patch }) || true,
      remove: async (id) => window.record({ op: 'remove', id }) || true,
      renameTopic: async (from, to) => window.record({ op: 'rename', from, to }) || true,
      replay: async (id, voice) => window.record({ op: 'replay', id, voice }) || true,
      ask: async (id, text) => window.record({ op: 'ask', id, text }) || true,
      onChange: () => {},
    };
  }, entries);
  await page.goto(pathToFileURL(new URL('../renderer/notebook.html', import.meta.url).pathname).href);
  await page.waitForSelector('.card');
  assert.equal(await page.locator('.card').count(), 4);
  assert.equal(await page.locator('body').evaluate((b) => b.innerText.includes('null')), false, 'nessun «null» sullo schermo');
  // argomenti con i conteggi, e il gruppo da classificare
  assert.match(await page.locator('#topics').innerText(), /Come funzionano gli LLM\s+2/);
  assert.match(await page.locator('#topics').innerText(), /Da classificare/);
  await page.click('.topic:has-text("Come funzionano gli LLM")');
  assert.equal(await page.locator('.card').count(), 2);
  assert.equal(await page.locator('#heading').innerText(), 'Come funzionano gli LLM');
  // filtro per tipo e ricerca
  await page.click('[data-kind="answer"]');
  assert.equal(await page.locator('.card').count(), 1);
  await page.click('[data-kind="all"]');
  await page.click('.topic:has-text("Tutto")');
  await page.fill('#search', 'piede');
  assert.equal(await page.locator('.card').count(), 1, 'la ricerca guarda anche le frasi dette');
  await page.fill('#search', '');
  // dettaglio di una lavagna: frasi numerate, riapri e riascolta
  await page.click('.card:has-text("Come funziona un Transformer")');
  assert.equal(await page.locator('.said li').count(), 2);
  await page.click('text=Riapri la lavagna');
  await page.click('text=Riascolta');
  await page.fill('.detail input[type=text]', 'E le teste?');
  await page.press('.detail input[type=text]', 'Enter');
  await page.selectOption('.detail select', 'Fisica del calcio');
  await page.click('text=Elimina');
  await page.click('text=Elimina davvero');
  // una domanda senza lavagna né modello non si riapre: si legge
  await page.click('.card:has-text("Perché la softmax")');
  assert.equal(await page.locator('text=Riapri').count(), 0);
  assert.match(await page.locator('.detail').innerText(), /sulla lavagna «Come funziona un Transformer»/);
  // rinomina un argomento con doppio clic
  await page.dblclick('.topic:has-text("Fisica del calcio")');
  await page.fill('.topic input', 'Fisica dello sport');
  await page.press('.topic input', 'Enter');
  await page.waitForTimeout(100);
  assert.deepEqual(calls.map((c) => c.op), ['replay', 'replay', 'ask', 'update', 'remove', 'rename']);
  assert.deepEqual(calls[1], { op: 'replay', id: 'a', voice: true });
  assert.deepEqual(calls[3].patch, { topic: 'Fisica del calcio' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ notebook: 'ok', calls: calls.length }));
} finally {
  await browser.close();
}
