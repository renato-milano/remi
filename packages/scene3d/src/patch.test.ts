import { describe, expect, it } from 'vitest';
import { type Scene, applyScenePatch } from './index.js';
const scene = (): Scene => ({
  version: 1,
  materials: {},
  nodes: [
    { id: 'ground', shape: 'box', size: [10, 0.1, 10] },
    {
      id: 'vehicle',
      shape: 'box',
      size: [2, 1, 1],
      animation: {
        duration: 3,
        keyframes: [
          { time: 0, offset: [0, 0, 0] },
          { time: 3, offset: [0, 2, 0] },
        ],
      },
      children: [
        {
          id: 'shaft',
          shape: 'cylinder',
          radius: 0.1,
          height: 0.4,
          attach: { to: 'vehicle', at: [0.5, 1, 0.5] },
          children: [
            { id: 'rotor', shape: 'propeller', radius: 2, spin: { axis: 'y', speed: 4 } },
            { id: 'plate', shape: 'torus', radius: 0.2, tube: 0.03 },
          ],
        },
        { id: 'skid', shape: 'box', size: [2, 0.1, 0.1] },
      ],
    },
  ],
});
describe('revisioni gerarchiche', () => {
  it('sostituisce nodi annidati senza duplicarli e conserva moto e figli', () => {
    const input = scene();
    const original = structuredClone(input);
    const result = applyScenePatch(input, {
      remove: ['shaft', 'skid'],
      nodes: [
        {
          id: 'shaft',
          shape: 'cylinder',
          radius: 0.08,
          height: 0.5,
          children: [{ id: 'rotor', shape: 'propeller', radius: 2.2 }],
        },
        {
          id: 'newSkid',
          shape: 'box',
          size: [2, 0.1, 0.1],
          attach: { to: 'vehicle', at: [0.5, 0, 0.5] },
        },
      ],
    });
    expect(result.errors).toEqual([]);
    expect(input).toEqual(original);
    expect(result.scene.nodes).toHaveLength(2);
    const vehicle = result.scene.nodes[1];
    expect(vehicle.children?.map((n) => n.id)).toEqual(['shaft', 'newSkid']);
    expect(vehicle.children?.[0].children?.[0].spin).toEqual({ axis: 'y', speed: 4 });
    expect(vehicle.animation).toEqual(input.nodes[1].animation);
    expect(result.touched).toContain('vehicle');
  });
  it('sostituire la forma di una parte non lascia parametri della forma precedente', () => {
    const result = applyScenePatch(scene(), {
      remove: [],
      nodes: [{ id: 'plate', shape: 'cylinder', radius: 0.2, height: 0.1 }],
    });
    expect(result.errors).toEqual([]);
    expect(result.scene.nodes[1].children?.[0].children?.[1]).not.toHaveProperty('tube');
  });
  it('rifiuta una revisione non valida senza cambiare la scena', () => {
    for (const nodes of [
      [{ id: 'vehicle', shape: 'box', size: [-1, 1, 1] }],
      [{ id: 'new', shape: 'sphere', attach: { to: 'missing', at: [0.5, 1, 0.5] } }],
      [{ id: 'new', shape: 'sphere', children: [{ id: 'rotor', shape: 'sphere' }] }],
    ]) {
      const input = scene();
      const result = applyScenePatch(input, { remove: [], nodes });
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.scene).toEqual(input);
    }
  });
});
