import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeReasoningBackend } from '@openmate/llm';
import type { ReasoningBackend, ReasoningEvent, ReasoningInput } from '@openmate/llm';
import { type MemorySystem, createMemory } from '@openmate/memory';
import { type AutonomyPolicy, ToolRegistry, createMemoryTools, createOverlayTools, shellRunTool } from '@openmate/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CognitiveLoop, TaskStore, wants3d } from './index.js';
import type { AgentEvent } from './index.js';

const policy: AutonomyPolicy = { shell: { allow: ['echo'], deny: [] }, files: { allow: [] } };

let root: string;
let mem: MemorySystem;
let tasks: TaskStore;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openmate-core-'));
  mem = createMemory(root);
  tasks = new TaskStore(join(root, 'openmate.db'));
});
afterEach(() => {
  tasks.close();
  mem.close();
  rmSync(root, { recursive: true, force: true });
});

function registry(): ToolRegistry {
  return new ToolRegistry().register(shellRunTool).registerAll(createMemoryTools(mem));
}

/** Backend che resta in attesa finché non viene abortito (per testare l'interrupt). */
class BlockingBackend implements ReasoningBackend {
  id = 'blocking';
  async *run(input: ReasoningInput): AsyncIterable<ReasoningEvent> {
    yield { type: 'tool-call', toolCallId: 'c1', toolName: 'noop', input: {} };
    await new Promise<void>((resolve) => {
      if (input.signal?.aborted) return resolve();
      input.signal?.addEventListener('abort', () => resolve(), { once: true });
    });
    yield { type: 'finish', finishReason: 'aborted', usage: {} };
  }
}

describe('@openmate/core — CognitiveLoop', () => {
  it('esegue un ciclo: azione, il task NON si chiude da solo (si riprende), reflection', async () => {
    const goal = tasks.createGoal({ title: 'Tenere una nota di test' });
    const task = tasks.createTask({ goalId: goal.id, title: 'Registrare la nota' });

    const backend = new FakeReasoningBackend([
      {
        callTool: 'memory.log',
        input: { kind: 'observation', actor: 'agent', content: 'nota wibble registrata' },
      },
      { text: 'Ho registrato la nota.' },
    ]);

    const events: AgentEvent[] = [];
    const loop = new CognitiveLoop({
      backend,
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 10 },
      requestApproval: async () => true,
      onEvent: (e) => events.push(e),
    });

    const result = await loop.runCycle({ kind: 'heartbeat' });

    expect(result.actions).toBe(1);
    // non chiuso automaticamente: l'agente non ha chiamato task.complete → torna 'pending'
    expect(tasks.getTask(task.id)?.status).toBe('pending');
    expect(tasks.getTask(task.id)?.attempts).toBe(1);
    // il tool ha davvero scritto in memoria
    expect(mem.search('wibble', { scope: 'episodic' }).length).toBeGreaterThan(0);
    // la reflection del ciclo è stata registrata
    expect(mem.search('completato', { scope: 'episodic' }).length).toBeGreaterThan(0);
    // ha attraversato lo stato 'acting' e chiuso in 'idle'
    const statuses = events.filter((e) => e.kind === 'state').map((e) => e.state.status);
    expect(statuses).toContain('acting');
    expect(loop.getState().status).toBe('idle');
  });

  it('termina in modo pulito quando lo script supera budget.maxSteps', async () => {
    const backend = new FakeReasoningBackend([{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }]);
    const loop = new CognitiveLoop({
      backend,
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 2 },
      requestApproval: async () => true,
    });

    const result = await loop.runCycle({ kind: 'user_message', content: 'ciao' });
    expect(result.text).toBe('ab'); // solo 2 step consumati
    expect(loop.getState().status).toBe('idle');
  });

  it('se finisce i passi mentre sta ancora agendo, lo dice invece di tacere', async () => {
    const events: AgentEvent[] = [];
    const backend = new FakeReasoningBackend([
      { callTool: 'memory.search', input: { query: 'uno' } },
      { callTool: 'memory.search', input: { query: 'due' } },
      { text: 'mai detto' },
    ]);
    const loop = new CognitiveLoop({
      backend,
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 2 },
      requestApproval: async () => true,
      onEvent: (e) => events.push(e),
    });

    const result = await loop.runCycle({ kind: 'user_message', content: 'fai tre cose' });
    expect(result.text).toContain('ho usato tutti i passi a disposizione (2)');
    const said = events.filter((e) => e.kind === 'message').map((e) => (e as { content: string }).content);
    expect(said.join(' ')).toContain('Vuoi che continui?');
  });

  it("l'interrupt annulla il ciclo e torna idle", async () => {
    const controller = new AbortController();
    const loop = new CognitiveLoop({
      backend: new BlockingBackend(),
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 10 },
      requestApproval: async () => true,
    });
    const p = loop.runCycle({ kind: 'user_message', content: 'vai' }, { signal: controller.signal });
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();
    await p;
    expect(loop.getState().status).toBe('idle');
    expect(mem.search('interrotto', { scope: 'episodic' }).length).toBeGreaterThan(0);
  });
});

/** Backend che registra i messaggi ricevuti a ogni ciclo. */
class RecordingBackend implements ReasoningBackend {
  id = 'recording';
  calls: ReasoningInput['messages'][] = [];
  reply = 'ok';
  async *run(input: ReasoningInput): AsyncIterable<ReasoningEvent> {
    this.calls.push(input.messages);
    yield { type: 'text-delta', text: this.reply };
    yield { type: 'finish', finishReason: 'stop', usage: {} };
  }
}

describe('@openmate/core — immagini nel messaggio utente', () => {
  it('le allega al turno corrente ma non le tiene nella cronologia', async () => {
    const backend = new RecordingBackend();
    const loop = new CognitiveLoop({
      backend,
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 4 },
      requestApproval: async () => true,
    });

    await loop.runCycle({
      kind: 'user_message',
      content: 'cos’è questo?',
      images: [{ data: 'AAAA', label: 'Schermo:' }],
    });
    await loop.runCycle({ kind: 'user_message', content: 'e poi?' });

    const first = backend.calls[0].at(-1);
    expect(Array.isArray(first?.content)).toBe(true);
    const parts = first?.content as Array<{ type: string; text?: string; image?: string }>;
    expect(parts.map((p) => p.type)).toEqual(['text', 'text', 'image']);
    expect(parts[2].image).toBe('AAAA');

    // turno successivo: la domanda precedente torna solo come testo
    const history = backend.calls[1];
    expect(history[0]).toEqual({ role: 'user', content: 'cos’è questo?' });
  });
});

describe('@openmate/core — risposta dentro overlay.draw', () => {
  it('la emette come messaggio e la tiene nella cronologia', async () => {
    const backend = new FakeReasoningBackend([
      { callTool: 'overlay_draw', input: { items: [{ type: 'point', x: 1, y: 1 }], answer: 'È il menu File.' } },
    ]);
    const events: AgentEvent[] = [];
    const frame = { imageW: 10, imageH: 10, x: 0, y: 0, w: 10, h: 10 };
    const loop = new CognitiveLoop({
      backend,
      registry: registry().registerAll(createOverlayTools({ frame: () => frame, draw: () => {}, clear: () => {} })),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 4 },
      requestApproval: async () => true,
      onEvent: (e) => events.push(e),
    });

    const result = await loop.runCycle({ kind: 'user_message', content: 'cos’è?', fast: true });

    expect(events.filter((e) => e.kind === 'message').map((e) => e.content)).toEqual(['È il menu File.']);
    expect(result.text).toBe('È il menu File.');
  });
});

describe('@openmate/core — cronologia dei turni "indica"', () => {
  it('tiene la domanda compatta e ricorda il pannello disegnato', async () => {
    const backend = new RecordingBackend();
    backend.reply = '<panel title="Come vola"><step><say>Spinge giù.</say><svg></svg></step></panel>';
    const loop = new CognitiveLoop({
      backend,
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 4 },
      requestApproval: async () => true,
    });
    await loop.runCycle({
      kind: 'user_message',
      content: 'spiegami come funziona\n\n[…guida lunga del pannello…]',
      historyText: 'spiegami come funziona [indicando un punto sullo schermo]',
      fast: true,
    });
    backend.reply = 'ok';
    await loop.runCycle({ kind: 'user_message', content: 'dimmi di più' });
    const history = backend.calls[1];
    expect(history[0]).toEqual({ role: 'user', content: 'spiegami come funziona [indicando un punto sullo schermo]' });
    expect(history[1]).toEqual({ role: 'assistant', content: '[Ho disegnato un pannello: «Come vola»] Spinge giù.' });
  });
});

describe('@openmate/core — modello 3D nella risposta', () => {
  it('toglie il blocco dal testo, emette le parti e lo ricorda nella cronologia', async () => {
    const reply =
      'Eccolo, guarda le pale.<scene3d>{"version":1,"title":"Ventola","materials":{"m":{"color":"#888888"}},' +
      '"nodes":[{"shape":"cylinder","radius":0.3,"height":0.2,"material":"m"},' +
      '{"shape":"rotor","axis":"y","count":5,"inner":0.3,"outer":2,"width":0.4,"material":"m"}]}</scene3d>';
    const inputs: ReasoningInput[] = [];
    const backend: ReasoningBackend = {
      id: 'chunks',
      async *run(input) {
        inputs.push(input);
        for (let i = 0; i < reply.length; i += 9) yield { type: 'text-delta', text: reply.slice(i, i + 9) };
        yield { type: 'finish', finishReason: 'stop', usage: {} };
      },
    };
    const events: AgentEvent[] = [];
    const loop = new CognitiveLoop({
      backend,
      registry: registry(),
      memory: mem,
      tasks,
      policy,
      budget: { maxSteps: 4 },
      requestApproval: async () => true,
      onEvent: (e) => events.push(e),
    });
    const result = await loop.runCycle({ kind: 'user_message', content: 'mostrami una ventola in 3D' });

    expect(inputs[0].fast).toBe(true); // ragionamento basso: le parti arrivano subito
    expect(inputs[0].system).toContain('<scene3d>');
    expect(result.text).toBe('Eccolo, guarda le pale.');
    expect(events.filter((e) => e.kind === 'message').map((e) => e.content)).toEqual(['Eccolo, guarda le pale.']);
    expect(events.filter((e) => e.kind === 'scene3d').map((e) => e.op)).toEqual(['start', 'node', 'node', 'end']);
    // la frase arriva prima delle parti, non a modello finito
    expect(events.findIndex((e) => e.kind === 'message')).toBeLessThan(
      events.findIndex((e) => e.kind === 'scene3d'),
    );

    await loop.runCycle({ kind: 'user_message', content: 'e il motore?' });
    expect(inputs[1].fast).toBe(false);
    expect(inputs[1].messages[1]).toEqual({
      role: 'assistant',
      content: '[Ho mostrato un modello 3D: «Ventola», 2 parti] Eccolo, guarda le pale.',
    });
  });
});

describe('@openmate/core — wants3d', () => {
  it('riconosce il 3D e il funzionamento in movimento, non le altre domande', () => {
    expect(wants3d('mostrami un drone in 3D')).toBe(true);
    expect(wants3d('fammi vedere un motore a scoppio in movimento')).toBe(true);
    expect(wants3d('come girano gli ingranaggi di un cambio?')).toBe(true);
    expect(wants3d('com’è fatto un drone?')).toBe(false);
    expect(wants3d('che ore sono?')).toBe(false);
  });
});
