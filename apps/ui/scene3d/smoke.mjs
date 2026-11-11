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

  // Contatti: la scena valida si riproduce; quella respinta resta ferma e mostra l'errore.
  for (const e of events(`<scene3d>${await example('contact-kick')}</scene3d>`)) await feed(e);
  await page.waitForTimeout(650);
  assert.equal((await snapshot()).parts, 3);
  assert.equal((await snapshot()).state.motion, true);
  // Moviola: la barra del tempo compare con i marcatori di inizio, contatto e fine, e le scie
  const kick = (await snapshot()).moviola;
  assert.equal(kick.shown, true);
  assert.equal(await page.locator('#timeline').isVisible(), true);
  assert.equal(await page.locator('#motion').isVisible(), false, 'con la moviola play e pausa stanno sulla barra');
  assert.deepEqual(kick.markers, [0, 1, 3]);
  assert.ok(kick.ghosts > 0, 'pose fantasma lungo il tiro');
  await page.click('#tl-play');
  assert.equal((await snapshot()).state.motion, false, 'il tasto ferma la scena');
  await page.click('#tl-next');
  assert.ok(Math.abs((await snapshot()).moviola.elapsed - 1) < 1e-6, 'il marcatore successivo è il contatto');
  assert.match(await page.locator('#tl-time').textContent(), /^1,00 \/ 3,00 s$/);
  await page.keyboard.press('ArrowRight');
  assert.ok(Math.abs((await snapshot()).moviola.elapsed - 3) < 1e-6, 'freccia destra: fine');
  await page.click('[data-speed="0.25"]');
  await page.keyboard.press(' ');
  assert.equal((await snapshot()).state.motion, true, 'spazio fa ripartire');
  const thumb = await page.evaluate(() => window.remi3d.thumbnail(320));
  assert.ok(thumb && thumb.length > 1000, 'miniatura per il quaderno');
  await page.screenshot({ path: `${shots}contact-kick.png`, omitBackground: true });
  const invalidContact = JSON.parse(await example('contact-collision'));
  invalidContact.contacts[0].source.point = [0, 0, 0];
  const rejected = events(`<scene3d>${JSON.stringify(invalidContact)}</scene3d>`);
  for (const e of rejected) await feed(e.op === 'end' ? { ...e, pendingRepair: true } : e);
  assert.equal(await page.locator('#error').isVisible(), false, 'nessun errore tecnico durante la riparazione');
  assert.equal((await snapshot()).state.building, true);
  assert.match(await page.locator('#hint').textContent(), /Correggo il movimento/);
  await feed({ ...rejected.at(-1), pendingRepair: false });
  assert.equal((await snapshot()).parts, 3, 'i corpi restano visibili in anteprima ferma');
  assert.equal((await snapshot()).state.motion, false);
  assert.equal(await page.locator('#motion').isDisabled(), true, 'l’anteprima non può avviare un movimento respinto');
  assert.equal(await page.locator('#error').isVisible(), true);
  assert.match(await page.locator("#error").textContent(), /Movimento non verificato/);

  // Una scena illustrativa arriva dallo stesso parser: il gruppo si muove e pausa lo ferma.
  for (const e of events(`<scene3d>${await example('free-fall')}</scene3d>`)) await feed(e);
  await page.waitForTimeout(650);
  const fallBefore = await snapshot();
  assert.equal(fallBefore.state.motion, true);
  assert.equal(fallBefore.renderScheduled, true);
  await page.waitForTimeout(350);
  const fallAfter = await snapshot();
  assert.notDeepEqual(fallAfter.labelPoints, fallBefore.labelPoints, 'le etichette seguono il corpo animato');
  await page.locator('#tl-play').click(); // scena con traiettorie: la pausa sta sulla moviola
  await page.waitForTimeout(150);
  const pausedFall = await snapshot();
  await page.waitForTimeout(150);
  assert.deepEqual((await snapshot()).labelPoints, pausedFall.labelPoints, 'pausa conserva la posizione');
  await page.screenshot({ path: `${shots}free-fall.png`, omitBackground: true });

  // Più corpi animati, con montaggi conservati dentro il gruppo mobile.
  const move = (offset) => ({ duration: 6, loop: 'once', keyframes: [
    { time: 0, offset: [0, 0, 0] }, { time: 6, offset },
  ] });
  const multi = { version: 1, style: 'real', materials: {}, nodes: [
    { id: 'aircraft', animation: move([0, 6, 0]), children: [
      { id: 'hull', shape: 'box', size: [4, 1, 1] },
      { id: 'mountedWing', shape: 'box', size: [1, 0.1, 2], attach: { to: 'hull', at: [0.5, 0.5, 1] } },
    ] },
    { id: 'otherBody', shape: 'sphere', radius: 0.3, position: [3, 0, 0], animation: move([-6, 0, 0]) },
  ] };
  for (const e of events(`<scene3d>${JSON.stringify(multi)}</scene3d>`)) await feed(e);
  await page.waitForTimeout(650);
  const multiBefore = (await snapshot()).boxes;
  await page.waitForTimeout(400);
  const multiAfter = (await snapshot()).boxes;
  const rise = multiAfter.hull.min[1] - multiBefore.hull.min[1];
  const wingRise = multiAfter.mountedWing.min[1] - multiBefore.mountedWing.min[1];
  assert.ok(rise > 0.1, 'il primo corpo si muove');
  assert.ok(multiAfter.otherBody.min[0] < multiBefore.otherBody.min[0] - 0.1, 'anche il secondo corpo si muove');
  assert.ok(Math.abs(rise - wingRise) < 0.001, 'l’ala segue la fusoliera senza separarsi');

  // Una revisione annidata durante un dettaglio non duplica parti né perde il moto.
  const vehicle = { version: 1, materials: {}, nodes: [
    { id: 'floor', shape: 'box', size: [6, .1, 6], position: [0, -.5, 0] },
    { id: 'vehicle', shape: 'box', size: [2, 1, 1], animation: move([0, 6, 0]), children: [
      { id: 'shaft', shape: 'cylinder', radius: .1, height: .3, attach: { to: 'vehicle', at: [.5, 1, .5] }, children: [
        { id: 'rotor', shape: 'propeller', radius: 1.5, axis: 'y', spin: { axis: 'y', speed: 4 }, position: [0, .2, 0] },
      ] },
    ] },
  ] };
  for (const e of events(`<scene3d>${JSON.stringify(vehicle)}</scene3d>`)) await feed(e);
  await feed({ op: 'detail-start', target: 'vehicle', header: { version: 1, materials: {} } });
  await feed({ op: 'detail-node', target: 'vehicle', node: { id: 'stale', shape: 'sphere', radius: .4 } });
  await feed({ op: 'patch', remove: ['shaft'], nodes: [{ id: 'shaft', shape: 'cylinder', radius: .1, height: .5, children: [{ id: 'rotor', shape: 'propeller', radius: 1.6, axis: 'y' }] }], errors: [] });
  await feed({ op: 'detail-end', target: 'vehicle', nodes: 1, errors: [] });
  assert.equal((await snapshot()).parts, 2, 'la revisione non promuove le parti annidate a copie indipendenti');
  await feed({ op: 'detail-start', target: 'vehicle', header: { version: 1, materials: {} } });
  await feed({ op: 'detail-node', target: 'vehicle', node: { id: 'refined', shape: 'roundedBox', size: [2, 1, 1], radius: .1 } });
  await feed({ op: 'detail-end', target: 'vehicle', nodes: 1, errors: [] });
  await page.waitForTimeout(650);
  const detailedBefore = (await snapshot()).boxes;
  await page.waitForTimeout(350);
  const detailedAfter = (await snapshot()).boxes;
  const bodyRise = detailedAfter.vehicle.min[1] - detailedBefore.vehicle.min[1];
  assert.ok(bodyRise > .1, 'il corpo dettagliato continua a salire');
  assert.ok(Math.abs(detailedAfter.shaft.min[1] - detailedBefore.shaft.min[1] - bodyRise) < .001, 'il rotore resta montato sul corpo in movimento');
  assert.ok((await snapshot()).triangles > 0, 'la sostituzione della geometria resta visibile');

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
