import { expect, it } from 'vitest';
import { partsToDetail } from './scene-detail.js';

it('non seleziona un veicolo animato anche quando il primo nodo è il terreno', () => {
  const nodes = [
    { id: 'ground', shape: 'box', size: [10, 1, 10] },
    {
      id: 'vehicle',
      shape: 'body',
      length: 6,
      width: 2,
      height: 2,
      label: { title: 'Fusoliera' },
      animation: {
        duration: 2,
        keyframes: [
          { time: 0, offset: [0, 0, 0] as [number, number, number] },
          { time: 2, offset: [0, 2, 0] as [number, number, number] },
        ],
      },
    },
    {
      id: 'fan',
      shape: 'body',
      length: 1,
      width: 1,
      height: 1,
      label: { title: 'Ventola' },
      children: [{ shape: 'sphere', spin: { axis: 'y', speed: 1 } }],
    },
    { id: 'engine', shape: 'body', length: 2, width: 1, height: 1, label: { title: 'Motore' } },
  ];
  expect(partsToDetail(nodes).map((n) => n.id)).toEqual(['engine']);
});
