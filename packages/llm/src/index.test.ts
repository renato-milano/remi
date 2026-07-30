import { tool } from 'ai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FakeReasoningBackend, type ReasoningEvent } from './index.js';

describe('@openmate/llm — FakeReasoningBackend', () => {
  it('esegue un giro di tool-call deterministico', async () => {
    const calls: string[] = [];
    const echo = tool({
      description: 'Restituisce il messaggio ricevuto',
      inputSchema: z.object({ msg: z.string() }),
      execute: async ({ msg }) => {
        calls.push(msg);
        return { echoed: msg };
      },
    });

    const backend = new FakeReasoningBackend([
      { text: 'penso...' },
      { callTool: 'echo', input: { msg: 'ciao' } },
      { text: 'fatto' },
    ]);

    const events: ReasoningEvent[] = [];
    for await (const e of backend.run({
      messages: [{ role: 'user', content: 'vai' }],
      tools: { echo },
      budget: { maxSteps: 10 },
    })) {
      events.push(e);
    }

    expect(calls).toEqual(['ciao']);
    const toolResult = events.find((e) => e.type === 'tool-result');
    expect(toolResult).toMatchObject({ toolName: 'echo', output: { echoed: 'ciao' } });
    expect(events.at(-1)?.type).toBe('finish');
  });

  it('rispetta budget.maxSteps', async () => {
    const backend = new FakeReasoningBackend([{ text: 'a' }, { text: 'b' }, { text: 'c' }]);
    const events: ReasoningEvent[] = [];
    for await (const e of backend.run({ messages: [], budget: { maxSteps: 2 } })) {
      events.push(e);
    }
    expect(events.filter((e) => e.type === 'text-delta')).toHaveLength(2);
  });
});
