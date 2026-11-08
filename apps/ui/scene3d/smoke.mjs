// Prova la finestra 3D in Chrome: gli eventi arrivano dallo stesso parser del daemon, a pezzi, come in streaming.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { SceneStream } from '@openmate/scene3d';
import { chromium } from 'playwright-core';

const ui = new URL('..', import.meta.url);
const shots = fileURLToPath(new URL('renderer/build/shots/', ui));
await mkdir(shots, { recursive: true });
const example = (name) =>
  readFile(fileURLToPath(new URL(`../../packages/scene3d/examples/${name}.json`, ui)), 'utf8');

/** Il testo della risposta del modello, spezzato in pezzi: restituisce gli eventi in ordine. */
function events(reply, size = 40) {
  const s = new SceneStream();
  const out = [];
  for (let i = 0; i < reply.length; i += size) out.push(...s.feed(reply.slice(i, i + size)).events);
  out.push(...s.end().events);
  return out;
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 940 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text()));
  await page.goto(new URL('renderer/scene3d.html', ui).href);
  await page.evaluate(() => document.fonts.ready);
  const snapshot = () => page.evaluate(() => window.remi3d.getSnapshot());
  const feed = (e) => page.evaluate((ev) => window.remi3d.feed(ev), e);

  // il jet arriva parte per parte: la scena cresce mentre è ancora "in costruzione"
  const jet = events(`Ecco il jet.<scene3d>${await example('jet')}</scene3d>`);
  const nodes = jet.filter((e) => e.op === 'node').length;
  assert.equal(jet[0].op, 'start');
  await feed(jet[0]);
  await feed(jet[1]);
  await feed(jet[2]);
  await page.waitForTimeout(100);
  let s = await snapshot();
  assert.equal(s.parts, 2);
  assert.equal(s.state.building, true);
  assert.ok(s.triangles > 0, 'le prime parti si vedono subito');
  assert.match(await page.locator('#hint').textContent(), /Costruisco il modello… 2 parti/);
  await page.screenshot({ path: `${shots}jet-building.png`, omitBackground: true });
  for (const e of jet.slice(3)) await feed(e);
  await page.waitForTimeout(600);
  s = await snapshot();
  assert.equal(s.parts, nodes);
  assert.equal(s.state.building, false);
  assert.equal(s.labels.length, 5);
  // all'apertura sezione e movimento sono accesi: i rotori girano, quindi si continua a disegnare
  assert.equal(s.state.section, true);
  assert.equal(s.state.motion, true);
  assert.equal(s.renderScheduled, true);
  await page.screenshot({ path: `${shots}jet-motion.png`, omitBackground: true });
  await page.locator('#motion').click();
  await page.waitForTimeout(100);
  assert.equal((await snapshot()).renderScheduled, false, 'a scena ferma il rendering si ferma');
  await page.screenshot({ path: `${shots}jet.png`, omitBackground: true });
  const jetGeometries = s.geometries;

  // etichetta e controlli
  await page.locator('[data-part="lift"]').click();
  assert.equal((await snapshot()).state.selected, 'lift');
  assert.equal(await page.locator('#explanation').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#explanation').isVisible(), false);
  await page.locator('#section').click();
  assert.equal((await snapshot()).state.section, false);
  await page.locator('#section').click();
  await page.locator('#motion').click();
  await page.waitForTimeout(300);
  assert.equal((await snapshot()).renderScheduled, true);

  // una nuova scena sostituisce la precedente e ne libera le risorse
  for (const e of events(`<scene3d>${await example('board')}</scene3d>`, 97)) await feed(e);
  await page.waitForTimeout(600);
  s = await snapshot();
  assert.equal(s.labels.length, 6);
  assert.equal(await page.locator('#section').isDisabled(), true);
  assert.equal(await page.locator('#motion').isDisabled(), true);
  await page.screenshot({ path: `${shots}board.png`, omitBackground: true });
  for (const e of jet) await feed(e);
  await page.waitForTimeout(600);
  assert.equal(
    (await snapshot()).geometries,
    jetGeometries,
    'nessuna geometria persa fra una scena e l’altra',
  );

  // etichette sui nodi, senza camera né colori: centro della parte e inquadratura automatici
  const gear = events(
    '<scene3d>{"version":1,"title":"Ingranaggio","materials":{"steel":{"color":"#8899aa"},"brass":{"color":"#c8a050"}},' +
      '"nodes":[{"shape":"cylinder","radius":1,"height":0.3,"material":"steel","label":{"title":"Disco","text":"Il corpo."}},' +
      '{"shape":"box","size":[0.3,0.3,0.3],"position":[0.9,0.3,0],"material":"brass","repeat":{"radial":12,"axis":"y"},' +
      '"label":{"title":"Denti"}}]}</scene3d>',
  );
  for (const e of gear) await feed(e);
  await page.waitForTimeout(600);
  s = await snapshot();
  assert.deepEqual(s.labels, ['label-0', 'label-1']);
  assert.equal(await page.locator('#title').textContent(), 'Ingranaggio');
  await page.screenshot({ path: `${shots}gear.png`, omitBackground: true });

  // tante etichette: righe compatte, ma tutte dentro lo schermo
  const many = Array.from({ length: 14 }, (_, i) => ({
    shape: 'box',
    size: [0.8, 0.8, 0.8],
    position: [(i % 7) * 1.2 - 3.6, Math.floor(i / 7) * 1.2, 0],
    label: { title: `Componente numero ${i + 1}` },
  }));
  for (const e of events(
    `<scene3d>${JSON.stringify({ version: 1, materials: {}, nodes: many })}</scene3d>`,
  ))
    await feed(e);
  await page.waitForTimeout(600);
  assert.equal((await snapshot()).labels.length, 14);
  for (const label of await page.locator('.callout').all()) {
    const box = await label.boundingBox();
    assert.ok(
      box.x >= 0 && box.x + box.width <= 1440 && box.y >= 0 && box.y + box.height <= 940,
      'etichetta fuori schermo',
    );
  }
  await page.screenshot({ path: `${shots}many-labels.png`, omitBackground: true });

  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, jetNodes: nodes, ...s }, null, 2));
} finally {
  await browser.close();
}
