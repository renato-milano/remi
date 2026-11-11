import { describe, expect, it } from 'vitest';
import { type SceneAnimation, sampleRotation, validateScene } from './index.js';

const accelerate: SceneAnimation = {
  duration: 4,
  loop: 'repeat',
  keyframes: [
    { time: 0, offset: [0, 0, 0] },
    { time: 1, offset: [-0.1, 0, 0], rotation: [0, 0, 20] },
    { time: 3, offset: [-0.5, 0, 0], rotation: [0, 0, -10] },
    { time: 4, offset: [-0.5, 0, 0] },
  ],
};

describe('assetto nei fotogrammi', () => {
  it('interpola la rotation; un fotogramma senza rotation vale assetto iniziale', () => {
    expect(sampleRotation(accelerate, 0)).toEqual([0, 0, 0]);
    expect(sampleRotation(accelerate, 0.5)).toEqual([0, 0, 10]);
    expect(sampleRotation(accelerate, 2)).toEqual([0, 0, 5]);
    expect(sampleRotation(accelerate, 3.5)).toEqual([0, 0, -5]);
  });

  it('senza rotation in nessun fotogramma non tocca la posa', () => {
    expect(sampleRotation({ duration: 1, keyframes: [{ time: 0, offset: [0, 0, 0] }, { time: 1, offset: [1, 0, 0] }] }, 0.5)).toBeNull();
  });

  it('la validazione accetta rotation e rifiuta un vettore sbagliato', () => {
    const scene = (frames: unknown) => ({
      version: 1,
      title: 'drone',
      materials: {},
      nodes: [{ id: 'd', shape: 'box', size: [1, 1, 1], animation: { duration: 4, keyframes: frames } }],
    });
    expect(validateScene(scene(accelerate.keyframes))).toEqual([]);
    const bad = [{ time: 0, offset: [0, 0, 0], rotation: [0, 20] }, { time: 4, offset: [1, 0, 0] }];
    expect(validateScene(scene(bad)).join(' ')).toMatch(/rotation/);
  });
});
