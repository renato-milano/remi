import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeReasoningBackend } from '@openmate/llm';
import { type MemorySystem, createMemory } from '@openmate/memory';
import { type AutonomyPolicy, ToolRegistry, createMemoryTools, shellRunTool } from '@openmate/tools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CognitiveLoop, TaskStore } from './index.js';
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

describe('@openmate/core — CognitiveLoop', () => {
  it('esegue un ciclo: azione, chiusura task, episodic di reflection', async () => {
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
    expect(tasks.getTask(task.id)?.status).toBe('done');
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
});
