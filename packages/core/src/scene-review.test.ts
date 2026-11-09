import { describe, expect, it, vi } from 'vitest';
import { parseFix, reviewPrompt, reviewScene, validateFix } from './scene-review.js';

const source = JSON.stringify({
  version: 1,
  title: 'Canadair',
  size: 28.6,
  materials: { guscio: { color: '#eeeeee' }, acqua: { color: '#4488ff', opacity: 0.6 } },
  nodes: [
    {
      id: 'fusoliera',
      shape: 'body',
      material: 'guscio',
      length: 19.8,
      width: 2.6,
      height: 3,
      position: [0, 0, 0],
    },
    {
      id: 'ala',
      shape: 'wing',
      material: 'guscio',
      span: 14,
      root: 3,
      tip: 2,
      axis: 'z',
      mirror: 'z',
      attach: { to: 'fusoliera', at: [0.45, 1, 0.5] },
    },
  ],
});

describe('revisione con la vista', () => {
  it('legge il blocco delle correzioni, anche con testo attorno', () => {
    const fix = parseFix(
      'Ecco.\n<scene3d-fix>{"remove":["x"],"nodes":[{"id":"ala","shape":"wing"}]}</scene3d-fix>\n',
    );
    expect(fix).toEqual({ remove: ['x'], nodes: [{ id: 'ala', shape: 'wing' }] });
  });

  it('accetta anche il JSON nudo e scarta ciò che non è JSON', () => {
    expect(parseFix('{"remove":[],"nodes":[]}')).toEqual({ remove: [], nodes: [] });
    expect(parseFix('nessuna correzione')).toBeUndefined();
    expect(parseFix('<scene3d-fix>{"remove": [1, "a"], "nodes": "no"}</scene3d-fix>')).toEqual({
      remove: ['a'],
      nodes: [],
    });
  });

  it('valida i nodi corretti col parser della scena e tiene gli errori', () => {
    const checked = validateFix(source, {
      remove: ['ala'],
      nodes: [
        {
          id: 'ala',
          shape: 'wing',
          material: 'guscio',
          span: 14.5,
          root: 3.2,
          tip: 2.1,
          axis: 'z',
          mirror: 'z',
          attach: { to: 'fusoliera', at: [0.45, 1, 0.5] },
        },
        { id: 'rotto', shape: 'box', material: 'guscio', size: [1, -2, 1] },
        {
          id: 'galleggiante',
          shape: 'capsule',
          material: 'guscio',
          radius: 0.4,
          length: 2,
          attach: { to: 'ala', at: [0.5, 0, 1] },
        },
      ],
    });
    expect(checked.nodes.map((n) => n.id)).toEqual(['ala', 'galleggiante']);
    expect(checked.remove).toEqual(['ala']);
    expect(checked.errors.length).toBeGreaterThan(0);
  });

  it('al massimo sei correzioni', () => {
    const nodes = Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      shape: 'sphere',
      material: 'guscio',
      radius: 1,
      position: [i, 0, 0],
    }));
    expect(validateFix(source, { remove: [], nodes }).nodes).toHaveLength(6);
  });

  it('il prompt porta oggetto e scena', () => {
    const p = reviewPrompt('Canadair', source);
    expect(p).toContain('Canadair');
    expect(p).toContain('"fusoliera"');
  });
});

it('non applica una revisione visiva arrivata dopo la finestra di 12 secondi', async () => {
  vi.useFakeTimers();
  try {
    const emit = vi.fn();
    await reviewScene({
      source,
      title: 'Canadair',
      images: ['test'],
      emit,
      backend: {
        id: 'late',
        async *run() {
          vi.setSystemTime(Date.now() + 13000);
          yield {
            type: 'text-delta',
            text: '<scene3d-fix>{"remove":["ala"],"nodes":[]}</scene3d-fix>',
          };
        },
      },
    });
    expect(emit).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
