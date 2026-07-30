import type { LanguageModel, ModelMessage, ToolSet } from 'ai';

export interface ProviderCapabilities {
  vision: boolean;
  toolUse: boolean;
  streaming: boolean;
}

/** Astrazione di un provider LLM (vedi docs/07, ADR-0007/0010). */
export interface Provider {
  id: string;
  capabilities: ProviderCapabilities;
  languageModel(modelId: string): LanguageModel;
}

/** Budget di un ciclo (anti loop-runaway, vedi docs/02). */
export interface Budget {
  maxSteps: number;
  maxTokens?: number;
  wallClockMs?: number;
}

export interface ReasoningInput {
  system?: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  budget: Budget;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** Eventi emessi dal ReasoningBackend verso il core (vedi docs/07). */
export type ReasoningEvent =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
  | { type: 'finish'; finishReason: string; usage: TokenUsage };

/** Il "cervello": OpenMate possiede il loop (B-first, ADR-0009). */
export interface ReasoningBackend {
  id: string;
  run(input: ReasoningInput): AsyncIterable<ReasoningEvent>;
}
