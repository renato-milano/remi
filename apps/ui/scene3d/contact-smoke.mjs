// Verifica che compilatore e Three.js usino davvero gli stessi spazi e orientamenti.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import * as T from 'three';
import { compileContacts } from '@openmate/scene3d';
const temp = await mkdtemp(join(tmpdir(), 'openmate-contact-'));
try {
  const entry = fileURLToPath(new URL('./build.js', import.meta.url));
  const output = join(temp, 'viewer-model.mjs');
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', outfile: output, logLevel: 'silent' });
  const { createScene } = await import(pathToFileURL(output).href);
  const scenes = [];
  for (const name of ['kick', 'collision', 'plane']) {
    scenes.push(JSON.parse(await readFile(new URL(`../../../packages/scene3d/examples/contact-${name}.json`, import.meta.url), 'utf8')));
  }
  const rotated = structuredClone(scenes[1]);
  const n = rotated.nodes.find((n) => n.id === 'striker');
  n.rotation = [17, 31, -12];
  const rotation = new T.Quaternion().setFromEuler(new T.Euler(...n.rotation.map((v) => v * Math.PI / 180)));
  rotated.contacts[0].source.point = new T.Vector3(-.1, 0, 0).applyQuaternion(rotation.invert()).toArray();
  scenes.push(rotated);
  for (const input of scenes) {
    const { scene, errors } = compileContacts(input);
    assert.deepEqual(errors, []);
    const model = createScene(scene);
    try {
      for (const n of scene.nodes) model.addNode(n);
      model.finish();
      const contact = scene.contacts[0];
      model.animate(contact.time);
      const part = (id) => { let found; model.root.traverse((o) => { if (o.userData.part === id) found = o; }); return found; };
      const point = (endpoint) => part(endpoint.node).localToWorld(new T.Vector3(...endpoint.point));
      assert.ok(point(contact.source).distanceTo(point(contact.target)) / model.unit < 1e-7, `${scene.title}: superfici allineate nel renderer`);
      if (scene.title.includes('tiro')) {
        const ball = part('ball');
        assert.ok(Math.abs(ball.rotation.y) < 1e-7, 'lo spin è ancora zero al momento del contatto');
        model.animate(.2);
        assert.ok(ball.rotation.y > 0, 'lo spin parte dopo il contatto');
      }
    } finally { model.dispose(); }
  }
  const detailed = createScene({ version: 1, materials: {} });
  detailed.addNode({ id: 'moving', shape: 'box', size: [2, 1, 1], animation: { duration: 3, loop: 'once', keyframes: [{ time: 0, offset: [0, 0, 0] }, { time: 3, offset: [0, 3, 0] }] }, children: [{ id: 'child', shape: 'sphere', radius: .2, position: [0, 1, 0] }] });
  detailed.finish();
  detailed.beginDetail('moving', { version: 1, materials: {} });
  detailed.addDetailNode('moving', { shape: 'box', size: [200, 200, 200] });
  assert.equal(detailed.endDetail('moving'), false, 'un dettaglio fuori ingombro lascia la parte originale');
  detailed.beginDetail('moving', { version: 1, materials: {} });
  detailed.addDetailNode('moving', { id: 'refined', shape: 'roundedBox', size: [2, 1, 1] });
  assert.equal(detailed.endDetail('moving'), true);
  const parts = new Map(); detailed.root.traverse((o) => { if (o.userData.part) parts.set(o.userData.part, o); });
  assert.equal(parts.get('moving').visible, true);
  assert.equal(parts.get('child').visible, true);
  const point = () => parts.get('refined').getWorldPosition(new T.Vector3()).y;
  const before = point(); detailed.animate(1);
  assert.ok(Math.abs(point() - before - 1) < 1e-7, 'la geometria di dettaglio eredita il movimento originale');
  detailed.dispose();
  console.log(JSON.stringify({ contactRenderer: 'ok', scenarios: scenes.length }));
} finally { await rm(temp, { recursive: true, force: true }); }
