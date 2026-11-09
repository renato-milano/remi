import { readFileSync } from 'node:fs';
import type { ReasoningBackend, ReasoningInput } from '@openmate/llm';
import { type Scene, SceneStream, type SceneStreamEvent } from '@openmate/scene3d';
import { assert, describe, expect, it, vi } from 'vitest';
import { repairContactScene } from './scene-repair.js';
const valid = (): Scene =>
  JSON.parse(
    readFileSync(new URL('../../scene3d/examples/contact-collision.json', import.meta.url), 'utf8'),
  );
const contacts = (scene: Scene) => {
  assert(scene.contacts);
  return scene.contacts;
};
const endFor = (scene: Scene) => {
  const parser = new SceneStream();
  const events = [
    ...parser.feed(`<scene3d>${JSON.stringify(scene)}</scene3d>`).events,
    ...parser.end().events,
  ];
  const end = events.find((e) => e.op === 'end');
  if (!end || end.op !== 'end') throw new Error('missing end');
  return end;
};
describe('correzione scene con contatti', () => {
  it('riporta l’errore geometrico al modello e pubblica solo la scena verificata', async () => {
    const input = valid();
    contacts(input)[0].source.point = [0, 0, 0];
    const calls: ReasoningInput[] = [];
    const emitted: SceneStreamEvent[] = [];
    const backend: ReasoningBackend = {
      id: 'repair-test',
      async *run(input) {
        calls.push(input);
        yield { type: 'text-delta', text: `<scene3d>${JSON.stringify(valid())}</scene3d>` };
        yield { type: 'finish', finishReason: 'stop', usage: { totalTokens: 30 } };
      },
    };
    const usage = await repairContactScene({
      backend,
      end: endFor(input),
      budget: { maxSteps: 3 },
      emit: (events) => emitted.push(...events),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].messages[0].content).toContain('superficie');
    expect(calls[0].tools).toBeUndefined();
    expect(calls[0].fast).toBe(true);
    expect(emitted.at(-1)).toMatchObject({ op: 'end', errors: [], nodes: 3 });
    expect(usage.totalTokens).toBe(30);
  });
  it('non accetta una riparazione che rimuove contacts e limita i tentativi', async () => {
    const scene = valid();
    contacts(scene)[0].source.point = [0, 0, 0];
    const bypass = valid();
    bypass.contacts = undefined;
    let calls = 0;
    const emitted: SceneStreamEvent[] = [];
    const backend: ReasoningBackend = {
      id: 'bypass',
      async *run() {
        calls++;
        yield { type: 'text-delta', text: `<scene3d>${JSON.stringify(bypass)}</scene3d>` };
      },
    };
    await repairContactScene({
      backend,
      end: endFor(scene),
      budget: { maxSteps: 3 },
      emit: (events) => emitted.push(...events),
    });
    expect(calls).toBe(1);
    expect(emitted.some((e) => e.op === 'node')).toBe(false);
    expect(emitted.at(-1)).toMatchObject({ op: 'end', nodes: 0, pendingRepair: false });
  });
  it('non ritenta scene valide, scene senza contatti o richieste annullate', async () => {
    let calls = 0;
    const backend: ReasoningBackend = {
      id: 'unused',
      async *run() {
        calls++;
        yield { type: 'finish', finishReason: 'stop', usage: {} };
      },
    };
    await repairContactScene({
      backend,
      end: endFor(valid()),
      budget: { maxSteps: 1 },
      emit: () => {},
    });
    const noContacts = valid();
    noContacts.contacts = undefined;
    await repairContactScene({
      backend,
      end: { ...endFor(noContacts), errors: ['other'] },
      budget: { maxSteps: 1 },
      emit: () => {},
    });
    const invalid = valid();
    contacts(invalid)[0].source.point = [0, 0, 0];
    await repairContactScene({
      backend,
      end: endFor(invalid),
      budget: { maxSteps: 1 },
      signal: AbortSignal.abort(),
      emit: () => {},
    });
    expect(calls).toBe(0);
  });
});

it('chiude lo stato di verifica quando la richiesta viene annullata', async () => {
  const scene = valid();
  contacts(scene)[0].source.point = [0, 0, 0];
  const emitted: SceneStreamEvent[] = [];
  const backend: ReasoningBackend = {
    id: 'cancelled',
    async *run() {
      yield { type: 'finish', finishReason: 'stop', usage: {} };
    },
  };
  await repairContactScene({
    backend,
    end: endFor(scene),
    budget: { maxSteps: 1 },
    signal: AbortSignal.abort(),
    emit: (events) => emitted.push(...events),
  });
  expect(emitted.at(-1)).toMatchObject({
    op: 'end',
    pendingRepair: false,
    errors: ['contacts: verifica interrotta'],
  });
});

it('interrompe l’attesa a 20 secondi anche se il backend non risponde', async () => {
  vi.useFakeTimers();
  try {
    const scene = valid();
    contacts(scene)[0].source.point = [0, 0, 0];
    const emitted: SceneStreamEvent[] = [];
    const backend: ReasoningBackend = {
      id: 'stuck',
      async *run() {
        await new Promise<void>(() => {});
        yield { type: 'finish', finishReason: 'stop', usage: {} };
      },
    };
    const work = repairContactScene({
      backend,
      end: endFor(scene),
      budget: { maxSteps: 1 },
      emit: (events) => emitted.push(...events),
    });
    await vi.advanceTimersByTimeAsync(20001);
    await work;
    expect(emitted.at(-1)).toMatchObject({ op: 'end', pendingRepair: false, preview: true });
  } finally {
    vi.useRealTimers();
  }
});
