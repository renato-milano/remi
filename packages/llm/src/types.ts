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
  /**
   * Prefisso obbligatorio da anteporre come primo blocco system. Usato dalla
   * modalità abbonamento Claude, che richiede il marker "You are Claude Code…".
   */
  systemPrefix?: string;
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
  /** Consente di annullare il ciclo in corso (kill-switch). */
  signal?: AbortSignal;
  /**
   * Restituisce (e consuma) l'ultimo screenshot in attesa (PNG base64), da
   * iniettare come user message prima del passo successivo. Vedi computer-use:
   * le immagini nei tool result non arrivano al modello su molti provider.
   */
  takeImage?(): string | undefined;
  /**
   * Turno interattivo (es. "indica e chiedi"): conta la latenza più della
   * profondità, quindi si chiede ragionamento basso ai modelli che lo supportano.
   */
  fast?: boolean;
  /**
   * Tool "finali": se un passo produce testo e chiama SOLO questi tool, il ciclo
   * finisce lì, senza un secondo giro per commentarne il risultato (es. overlay).
   */
  finalTools?: string[];
  /** Modello diverso da quello predefinito per questo ciclo (es. il modello rapido). */
  model?: string;
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
