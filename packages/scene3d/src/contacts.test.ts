import { readFileSync } from 'node:fs';
import { assert, describe, expect, it } from 'vitest';
import { type Scene, SceneStream, type SceneStreamEvent, compileContacts } from './index.js';
const example = (name: string): Scene =>
  JSON.parse(readFileSync(new URL(`../examples/contact-${name}.json`, import.meta.url), 'utf8'));
const contacts = (scene: Scene) => {
  assert(scene.contacts);
  return scene.contacts;
};
const parse = (scene: Scene) => {
  const parser = new SceneStream();
  const events: SceneStreamEvent[] = [];
  const text = `<scene3d>${JSON.stringify(scene)}</scene3d>`;
  for (let i = 0; i < text.length; i += 17)
    events.push(...parser.feed(text.slice(i, i + 17)).events);
  events.push(...parser.end().events);
  return events;
};
describe('contatti espliciti', () => {
  for (const name of ['kick', 'collision', 'plane'])
    it(`compila e verifica ${name}`, () => {
      const input = example(name);
      const original = structuredClone(input);
      const result = compileContacts(input);
      expect(result.errors).toEqual([]);
      expect(input).toEqual(original);
      const events = parse(input);
      expect(events.at(-1)).toMatchObject({ op: 'end', errors: [], nodes: input.nodes.length });
      expect(events.filter((e) => e.op === 'node')).toHaveLength(input.nodes.length);
    });
  it('allinea la superficie scelta con la rotazione del piede e coordina la reazione', () => {
    const { scene, errors } = compileContacts(example('kick'));
    expect(errors).toEqual([]);
    const foot = scene.nodes.find((n) => n.id === 'foot');
    const ball = scene.nodes.find((n) => n.id === 'ball');
    assert(foot?.animation && ball?.animation);
    const frame = foot.animation.keyframes.find((f) => f.time === 1);
    assert(frame);
    const offset = frame.offset;
    expect((foot.position as number[])[0] + offset[0]).toBeCloseTo(0.1385640646, 7);
    expect((foot.position as number[])[2] + offset[2]).toBeCloseTo(0.08, 7);
    expect(ball.animation.keyframes.slice(0, 2)).toEqual([
      { time: 0, offset: [0, 0, 0] },
      { time: 1, offset: [0, 0, 0] },
    ]);
    expect(ball.spin).toMatchObject({ start: 1 });
  });
  it('non emette nodi prima della verifica completa', () => {
    const parser = new SceneStream();
    const text = JSON.stringify(example('kick'));
    const partial = parser.feed(`<scene3d>${text.slice(0, -1)}`);
    expect(partial.events.some((e) => e.op === 'node')).toBe(false);
    const end = parser.feed('}</scene3d>');
    expect(end.events.filter((e) => e.op === 'node')).toHaveLength(3);
  });
  it('blocca contatto anticipato e attraversamento dopo il contatto', () => {
    for (const time of [1.5]) {
      const input = example('collision');
      const a = input.nodes[1].animation;
      assert(a);
      a.keyframes.push({ time, offset: [time < 1 ? -0.8 : -1.3, 0, 0] });
      a.keyframes.sort((a, b) => a.time - b.time);
      const result = compileContacts(input);
      expect(
        result.errors.some(
          (e) => e.includes('compenetrazione') || e.includes('contatto anticipato'),
        ),
      ).toBe(true);
      expect(parse(input).at(-1)).toMatchObject({ nodes: 0, preview: true });
    }
  });
  it('rifiuta punti interni, facce sbagliate, id assenti, scale non uniformi e catene di contatti', () => {
    const cases: ((scene: Scene) => void)[] = [
      (s) => {
        contacts(s)[0].source.point = [0, 0, 0];
      },
      (s) => {
        contacts(s)[0].source.point = [0.1, 0, 0];
      },
      (s) => {
        contacts(s)[0].source.node = 'missing';
      },
      (s) => {
        s.nodes[1].scale = [1, 2, 1];
      },
      (s) => {
        contacts(s).push({ ...contacts(s)[0], id: 'second' });
      },
    ];
    for (const change of cases) {
      const scene = example('collision');
      change(scene);
      expect(compileContacts(scene).errors.length).toBeGreaterThan(0);
    }
  });
  it('supporta box orientati e controlla il contatto con un piano', () => {
    const s = example('plane');
    s.nodes[1].shape = 'box';
    const { radius: _radius, ...node } = s.nodes[1];
    s.nodes[1] = node;
    s.nodes[1].size = [0.2, 0.2, 0.2];
    expect(compileContacts(s).errors).toEqual([]);
    s.nodes[1].rotation = [0, 0, 45];
    expect(compileContacts(s).errors.some((e) => e.includes('contrapposte'))).toBe(true);
  });
});

it('il fallback di un materiale è un avviso e non blocca contatti validi', () => {
  const scene = example('collision');
  scene.nodes[1].material = 'materiale_non_definito';
  const events = parse(scene);
  expect(events.at(-1)).toMatchObject({
    op: 'end',
    errors: [],
    nodes: 3,
    warnings: [expect.stringContaining('uso quello di base')],
  });
  expect(events.filter((e) => e.op === 'node')).toHaveLength(3);
});

it('costruisce un avvicinamento dal lato della superficie scelta', () => {
  const input = example('collision');
  const a = input.nodes[1].animation;
  assert(a);
  a.keyframes.splice(1, 0, { time: 0.5, offset: [-0.8, 0, 0] });
  const result = compileContacts(input);
  expect(result.errors).toEqual([]);
  expect(result.scene.nodes[1].animation?.keyframes[1].offset[0]).toBeGreaterThan(-0.6);
});

it('calcola i punti di contatto dalle direzioni senza richiedere coordinate esatte', () => {
  const input = example('kick');
  const list = contacts(input);
  list[0].source = { node: list[0].source.node, direction: [0, 0, -1] };
  list[0].target = { node: list[0].target.node, direction: [0.8660254, 0, 0.5] };
  const result = compileContacts(input);
  expect(result.errors).toEqual([]);
  const point = contacts(result.scene)[0].target.point;
  assert(point);
  expect(Math.hypot(...point)).toBeCloseTo(0.11, 10);
  expect(contacts(result.scene)[0].source.point?.[2]).toBeCloseTo(-0.05, 10);
  list[0].target.direction = [0, 0, 0];
  expect(compileContacts(input).errors.some((e) => e.includes('direzione'))).toBe(true);
});
