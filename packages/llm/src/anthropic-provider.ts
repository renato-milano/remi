import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';
import type { Provider, ProviderCapabilities } from './types.js';

export interface AnthropicProviderOptions {
  apiKey?: string;
  baseURL?: string;
}

/** Provider di default: Claude (vision-capable, richiesto dal computer-use). */
export function createAnthropicProvider(opts: AnthropicProviderOptions = {}): Provider {
  const anthropic = createAnthropic({
    ...(opts.apiKey ? { apiKey: opts.apiKey } : {}),
    ...(opts.baseURL ? { baseURL: opts.baseURL } : {}),
  });
  const capabilities: ProviderCapabilities = { vision: true, toolUse: true, streaming: true };
  return {
    id: 'anthropic',
    capabilities,
    languageModel: (modelId: string): LanguageModel => anthropic(modelId),
  };
}
