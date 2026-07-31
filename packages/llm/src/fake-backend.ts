import type { ReasoningBackend, ReasoningEvent, ReasoningInput } from './types.js';

/** Passo scriptato del FakeReasoningBackend. */
export type FakeStep = { text: string } | { callTool: string; input: unknown };

/**
 * Backend deterministico per i test (nessuna rete/AI SDK): emette testo scriptato
 * e, quando previsto, invoca davvero l'`execute` del tool (round-trip
 * tool-call → tool-result), rispettando budget.maxSteps.
 */
export class FakeReasoningBackend implements ReasoningBackend {
  readonly id = 'fake';

  constructor(private readonly script: FakeStep[]) {}

  async *run(input: ReasoningInput): AsyncIterable<ReasoningEvent> {
    let steps = 0;
    let callSeq = 0;
    for (const step of this.script) {
      if (steps >= input.budget.maxSteps || input.signal?.aborted) break;
      steps += 1;

      if ('text' in step) {
        yield { type: 'text-delta', text: step.text };
        continue;
      }

      const toolCallId = `call_${(callSeq += 1)}`;
      yield { type: 'tool-call', toolCallId, toolName: step.callTool, input: step.input };
      const tool = input.tools?.[step.callTool];
      const output = tool?.execute
        ? await tool.execute(step.input, { toolCallId, messages: input.messages })
        : undefined;
      yield { type: 'tool-result', toolCallId, toolName: step.callTool, output };
    }
    yield { type: 'finish', finishReason: 'stop', usage: {} };
  }
}
