import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SceneStream, type SceneStreamEvent, validateScene } from './index.js';

const example = (name: string) =>
  readFileSync(new URL(`../examples/${name}.json`, import.meta.url), 'utf8');

/** Passa il testo al parser in pezzi di lunghezza variabile, come arriva dal modello. */
function streamIn(text: string, sizes = [1, 7, 23, 3, 64]) {
  const s = new SceneStream();
  const events: SceneStreamEvent[] = [];
  let out = '';
  for (let i = 0, k = 0; i < text.length; k++) {
    const size = sizes[k % sizes.length];
    const r = s.feed(text.slice(i, i + size));
    out += r.text;
    events.push(...r.events);
    i += size;
  }
  const r = s.end();
  return { stream: s, text: out + r.text, events: [...events, ...r.events] };
}

describe('validateScene', () => {
  it('accetta le scene di esempio', () => {
    expect(validateScene(JSON.parse(example('jet')))).toEqual([]);
    expect(validateScene(JSON.parse(example('board')))).toEqual([]);
  });

  it('riporta gli errori col percorso JSON', () => {
    const errors = validateScene({
      version: 1,
      materials: { steel: { color: '#8899aa' } },
      nodes: [
        { shape: 'gear', material: 'iron' },
        { shape: 'box', size: [1, -1, 1], label: { text: 'x' } },
      ],
    });
    expect(errors).toContain(
      'nodes[0].shape: forma sconosciuta «gear»; disponibili: box, cylinder, cone, sphere, roundedBox, capsule, profile, torus, lathe, loft, plate, tube, rotor, line, body, wing, wheel, duct, stages, arrow, propeller',
    );
    expect(errors.some((e) => e.startsWith('nodes[0].material: materiale non definito'))).toBe(
      true,
    );
    expect(errors).toContain('nodes[1].size: atteso [x, y, z] con valori > 0');
    expect(errors).toContain('nodes[1].label.title: obbligatorio');
  });

  it('limita gli oggetti dopo le ripetizioni', () => {
    const node = { shape: 'box', size: [1, 1, 1], repeat: { grid: [20, 20, 1], step: [1, 0, 1] } };
    const errors = validateScene({ version: 1, materials: {}, nodes: Array(16).fill(node) });
    expect(errors.at(-1)).toMatch(/oggetti dopo le ripetizioni/);
  });
});

describe('SceneStream', () => {
  it('emette intestazione, nodi ed etichette mentre il JSON arriva, e toglie il blocco dal testo', () => {
    const jet = JSON.parse(example('jet'));
    const { text, events, stream } = streamIn(
      `Ecco il jet, guarda il motore.\n<scene3d>${example('jet')}</scene3d>\nGiralo pure.`,
    );
    expect(text).toBe('Ecco il jet, guarda il motore.\n\nGiralo pure.');
    expect(events[0]).toMatchObject({
      op: 'start',
      header: { title: jet.title, section: jet.section },
    });
    const nodes = events.filter((e) => e.op === 'node');
    expect(nodes.map((e) => e.op === 'node' && e.node)).toEqual(jet.nodes);
    expect(events.find((e) => e.op === 'labels')).toEqual({ op: 'labels', labels: jet.labels });
    expect(events.at(-1)).toMatchObject({
      op: 'end',
      title: jet.title,
      nodes: jet.nodes.length,
      errors: [],
    });
    // il JSON originale viaggia con la fine, per i dump di debug
    const end = events.at(-1);
    expect(end?.op === 'end' && JSON.parse(end.source ?? '')).toEqual(jet);
    expect(stream.used).toBe(true);
  });

  it('emette ogni nodo appena è chiuso, prima della fine del blocco', () => {
    const s = new SceneStream();
    const r1 = s.feed(
      '<scene3d>{"version":1,"materials":{"a":{"color":"#ffffff"}},"nodes":[{"shape":"box","size":[1,1,1]}',
    );
    expect(r1.events.map((e) => e.op)).toEqual(['start', 'node']);
    const r2 = s.feed(',{"shape":"sphere"');
    expect(r2.events).toEqual([]);
    const r3 = s.feed(',"radius":2}]}</scene3d>');
    expect(r3.events.map((e) => e.op)).toEqual(['node', 'end']);
  });

  it('scarta i nodi non validi e prosegue con gli altri', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"materials":{"a":{"color":"#ffffff"}},"nodes":[{"shape":"gear"},{"shape":"box","size":[1,1,1],"material":"a"}]}</scene3d>',
    );
    expect(events.filter((e) => e.op === 'node')).toHaveLength(1);
    const end = events.at(-1);
    expect(end?.op === 'end' && end.errors[0]).toMatch(/^nodes\[0\]\.shape/);
  });

  it('di una parte con un figlio sbagliato scarta solo quel figlio', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"materials":{"a":{"color":"#ffffff"}},"nodes":[{"id":"braccio","children":[' +
        '{"shape":"box","size":[2,0.1,0.1]},{"children":[{"shape":"cylinder","radius":0.1,"height":0.2},{"shape":"rotor"}]}]}]}</scene3d>',
    );
    const node = events.find((e) => e.op === 'node');
    expect(node?.op === 'node' && node.node).toEqual({
      id: 'braccio',
      children: [
        { shape: 'box', size: [2, 0.1, 0.1] },
        { children: [{ shape: 'cylinder', radius: 0.1, height: 0.2 }] },
      ],
    });
    const end = events.at(-1);
    expect(end?.op === 'end' && end.errors).toContain(
      'nodes[0].children[1].children[1].count: obbligatorio per rotor',
    );
  });

  it('accetta la forma scritta come oggetto annidato', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"materials":{},"nodes":[{"children":[{"shape":{"type":"box","size":[1,2,3]},"position":[0,1,0]}]}]}</scene3d>',
    );
    const node = events.find((e) => e.op === 'node');
    expect(node?.op === 'node' && node.node).toEqual({
      children: [{ size: [1, 2, 3], position: [0, 1, 0], shape: 'box' }],
    });
  });

  it('accetta il nome della forma come chiave o in "type"', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"materials":{},"nodes":[{"lathe":{"profile":[[0,1],[1,1]]},"position":[0,1,0]},{"type":"sphere","radius":2}]}</scene3d>',
    );
    expect(events.filter((e) => e.op === 'node').map((e) => e.op === 'node' && e.node)).toEqual([
      {
        profile: [
          [0, 1],
          [1, 1],
        ],
        position: [0, 1, 0],
        shape: 'lathe',
      },
      { radius: 2, shape: 'sphere' },
    ]);
  });

  it('accetta i parametri racchiusi in un oggetto e la misura del box in scale', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"materials":{},"nodes":[' +
        '{"id":"a","shape":"roundedBox","position":[0,1,0],"shapeArgs":{"size":[4,1,2],"radius":0.2}},' +
        '{"id":"b","shape":"box","scale":[3,0.2,8]},' +
        '{"id":"c","shape":"box","dimensions":[1,1,1],"scale":2},' +
        '{"id":"d","shape":"sphere","params":{"radius":1},"scale":[1,2,1]}]}</scene3d>',
    );
    expect(events.filter((e) => e.op === 'node').map((e) => e.op === 'node' && e.node)).toEqual([
      { id: 'a', shape: 'roundedBox', position: [0, 1, 0], size: [4, 1, 2], radius: 0.2 },
      { id: 'b', shape: 'box', size: [3, 0.2, 8] },
      { id: 'c', shape: 'box', size: [1, 1, 1], scale: 2 },
      { id: 'd', shape: 'sphere', radius: 1, scale: [1, 2, 1] },
    ]);
    expect(events.find((e) => e.op === 'end')).toMatchObject({ nodes: 4, errors: [] });
  });

  it('monta le parti con attach, misure in metri e vernice; riporta al bordo un aggancio appena fuori', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"size":4.2,"materials":{"r":{"color":"#c0201a"}},"nodes":[' +
        '{"id":"scocca","shape":"body","length":4.2,"width":1.8,"height":1.2,"square":0.6,"material":"r","paint":[{"color":"#222222","y":[0,0.15]}]},' +
        '{"id":"ruota","shape":"wheel","radius":0.33,"width":0.22,"mirror":"z","attach":{"to":"scocca","at":[0.2,-0.1,1.05]}},' +
        '{"id":"ala","shape":"wing","span":1,"root":0.5,"axis":"y","attach":{"to":"scocca","at":[0.9,1,0.5]}}]}</scene3d>',
    );
    const nodes = events.filter((e) => e.op === 'node');
    expect(nodes).toHaveLength(3);
    expect(nodes[1].op === 'node' && nodes[1].node.attach).toEqual({ to: 'scocca', at: [0.2, 0, 1] });
    expect(events.find((e) => e.op === 'start')).toMatchObject({ header: { size: 4.2 } });
    expect(events.find((e) => e.op === 'end')).toMatchObject({ errors: [] });
  });

  it('stacca i sotto-pezzi con attach e li monta come parti a sé', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"materials":{"g":{"color":"#888888"}},"nodes":[' +
        '{"id":"corpo","shape":"box","size":[2,1,1],"material":"g","children":[' +
        '{"id":"batteria","shape":"box","size":[1,0.5,0.5],"attach":{"to":"corpo","at":[0.5,0.5,0.5]}},' +
        '{"shape":"duct","radius":0.5,"height":0.2,"mirror":"z","attach":{"at":[0.3,0.5,1]},"children":[' +
        '{"id":"motore","shape":"cylinder","radius":0.1,"height":0.2,"attach":{"to":"corpo","at":[0.3,1,1]}}]}]}]}</scene3d>',
    );
    const nodes = events.filter((e) => e.op === 'node').map((e) => e.op === 'node' && e.node);
    expect(nodes.map((n) => n && n.id)).toEqual(['corpo', 'batteria', undefined, 'motore']);
    expect(nodes[0]).not.toHaveProperty('children');
    // ereditano materiale e specchiatura; senza "to" si attaccano al genitore
    expect(nodes[2]).toMatchObject({ material: 'g', mirror: 'z', attach: { to: 'corpo', at: [0.3, 0.5, 1] } });
    expect(nodes[3]).toMatchObject({ material: 'g', mirror: 'z' });
    expect(events.find((e) => e.op === 'end')).toMatchObject({ errors: [] });
  });

  it('tollera recinti di codice, version mancante e blocco troncato', () => {
    const { events, text } = streamIn(
      'Ok <scene3d>```json\n{"materials":{},"nodes":[{"shape":"box","size":[1,1,1]},{"shape":"bo',
    );
    expect(text).toBe('Ok ');
    expect(events.map((e) => e.op)).toEqual(['start', 'node', 'end']);
  });

  it('legge anche una scena con i campi in un altro ordine', () => {
    const { events } = streamIn(
      '<scene3d>{"version":1,"labels":[{"title":"Cubo","at":[0,0,0]}],"nodes":[{"shape":"box","size":[1,1,1],"material":"a"}],"materials":{"a":{"color":"#ffffff"}}}</scene3d>',
    );
    // i nodi arrivano prima dei materiali: in streaming si scartano, ma il blocco si chiude pulito
    expect(events.at(0)?.op).toBe('start');
    expect(events.at(-1)?.op).toBe('end');
  });

  it('non tocca il testo senza scena, nemmeno con un "<" a metà', () => {
    const { text, events } = streamIn('a < b e <scene non è un tag');
    expect(text).toBe('a < b e <scene non è un tag');
    expect(events).toEqual([]);
  });
});
