import { type LanguageModel, type ModelMessage, type StopCondition, type ToolSet, stepCountIs, streamText } from 'ai';
import type { ReasoningBackend, ReasoningEvent, ReasoningInput } from './types.js';

export interface DirectProviderOptions {
  /**
   * Prefisso da anteporre come primo blocco system (es. il marker "You are
   * Claude Code…" richiesto dai token di abbonamento Claude).
   */
  systemPrefix?: string;
  /** Crea un altro modello dello stesso provider, se un ciclo ne chiede uno diverso. */
  modelFor?: (modelId: string) => LanguageModel;
}

/**
 * Alcuni provider (Anthropic via gateway) rifiutano un tool_use.input che non
 * sia un oggetto: i tool senza parametri possono serializzarsi come "" → errore
 * "Input should be a valid dictionary". Qui forziamo ogni input a un oggetto.
 */
function sanitizeToolInputs(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) return m;
    const content = m.content.map((p) => {
      // biome-ignore lint/suspicious/noExplicitAny: parte content AI SDK
      const part = p as any;
      if (part?.type === 'tool-call') {
        const input = part.input ?? part.args;
        if (input === null || input === undefined || typeof input !== 'object') {
          return { ...part, input: {} };
        }
      }
      return p;
    });
    return { ...m, content } as ModelMessage;
  });
}

/**
 * Ragionamento basso per i turni interattivi. Misurato su Gemini 3.8 Flash via
 * gateway: primo token ~2 s invece di 5-9 s. Anthropic non ragiona di default.
 */
const FAST_PROVIDER_OPTIONS = {
  openai: { reasoningEffort: 'low' },
  'openai-compatible': { reasoningEffort: 'low' },
};

/**
 * Ferma il ciclo dopo un passo che ha chiamato solo tool "finali" e ha già dato
 * la risposta: come testo o nel campo `answer` del tool (es. overlay.draw).
 */
function endsOnFinalTools(names: string[]): StopCondition<ToolSet> {
  const finals = new Set(names);
  return ({ steps }) => {
    const last = steps.at(-1);
    if (!last || last.toolCalls.length === 0) return false;
    if (!last.toolCalls.every((c) => finals.has(c.toolName))) return false;
    const answered = last.toolCalls.some((c) => {
      const answer = (c.input as { answer?: unknown } | null)?.answer;
      return typeof answer === 'string' && answer.trim() !== '';
    });
    return answered || last.text.trim() !== '';
  };
}

/**
 * DirectProviderBackend: OpenMate esegue il proprio loop chiamando gli endpoint
 * del modello tramite l'AI SDK (streamText + stopWhen). Il budget di step è
 * nativo; la wall-clock è una guardia aggiuntiva. Vedi ADR-0009, docs/11.
 */
export class DirectProviderBackend implements ReasoningBackend {
  readonly id = 'direct-provider';
  private readonly systemPrefix?: string;
  private readonly modelFor?: (modelId: string) => LanguageModel;

  constructor(
    private readonly model: LanguageModel,
    opts: DirectProviderOptions = {},
  ) {
    this.systemPrefix = opts.systemPrefix;
    this.modelFor = opts.modelFor;
  }

  async *run(input: ReasoningInput): AsyncIterable<ReasoningEvent> {
    const startedAt = Date.now();
    const takeImage = input.takeImage;
    // Il marker (se presente) deve essere il PRIMO blocco system.
    const system = this.systemPrefix
      ? [this.systemPrefix, input.system].filter(Boolean).join('\n\n')
      : input.system;
    const result = streamText({
      model: input.model && this.modelFor ? this.modelFor(input.model) : this.model,
      system,
      messages: input.messages,
      tools: input.tools,
      stopWhen: input.finalTools?.length
        ? [stepCountIs(input.budget.maxSteps), endsOnFinalTools(input.finalTools)]
        : stepCountIs(input.budget.maxSteps),
      providerOptions: input.fast ? FAST_PROVIDER_OPTIONS : undefined,
      abortSignal: input.signal,
      // Inietta l'ultimo screenshot come user message prima del passo: le immagini
      // nei tool result non raggiungono il modello su OpenAI-compatible.
      prepareStep: takeImage
        ? ({ messages }) => {
            const msgs = sanitizeToolInputs(messages);
            const img = takeImage();
            if (!img) return { messages: msgs };
            return {
              messages: [
                ...msgs,
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: 'Screenshot attuale dello schermo (le coordinate sono in questi pixel):',
                    },
                    { type: 'image', image: img, mediaType: 'image/png' },
                  ],
                },
              ],
            };
          }
        : undefined,
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
        case 'error':
          // errore del provider (auth/modello/base URL…): propagalo pulito
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        default:
          break;
      }
    }

    let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
    let finishReason = 'stop';
    try {
      usage = await result.usage;
      finishReason = await result.finishReason;
    } catch {
      // stream terminato senza output: l'errore è già stato propagato sopra
    }
    yield {
      type: 'finish',
      finishReason,
      usage: {
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
      },
    };
  }
}
