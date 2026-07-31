import { type LanguageModel, stepCountIs, streamText } from 'ai';
import type { ReasoningBackend, ReasoningEvent, ReasoningInput } from './types.js';

/**
 * DirectProviderBackend: OpenMate esegue il proprio loop chiamando gli endpoint
 * del modello tramite l'AI SDK (streamText + stopWhen). Il budget di step è
 * nativo; la wall-clock è una guardia aggiuntiva. Vedi ADR-0009, docs/11.
 */
export class DirectProviderBackend implements ReasoningBackend {
  readonly id = 'direct-provider';

  constructor(private readonly model: LanguageModel) {}

  async *run(input: ReasoningInput): AsyncIterable<ReasoningEvent> {
    const startedAt = Date.now();
    const result = streamText({
      model: this.model,
      system: input.system,
      messages: input.messages,
      tools: input.tools,
      stopWhen: stepCountIs(input.budget.maxSteps),
      abortSignal: input.signal,
    });

    for await (const part of result.fullStream) {
      if (input.budget.wallClockMs && Date.now() - startedAt > input.budget.wallClockMs) break;
      switch (part.type) {
        case 'text-delta':
          yield { type: 'text-delta', text: part.text };
          break;
        case 'tool-call':
          yield {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          };
          break;
        case 'tool-result':
          yield {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output,
          };
          break;
        default:
          break;
      }
    }

    const usage = await result.usage;
    yield {
      type: 'finish',
      finishReason: await result.finishReason,
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
      },
    };
  }
}
