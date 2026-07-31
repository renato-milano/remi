import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Provider, ProviderCapabilities } from './types.js';

export type ProviderName = 'anthropic' | 'openai' | 'openai-compatible';

export interface ProviderSettings {
  name: ProviderName;
  /** Base URL per i provider OpenAI-compatible (OpenRouter, Vercel, Ollama, LiteLLM…). */
  baseURL?: string;
  apiKey?: string;
}

function make(
  id: string,
  capabilities: ProviderCapabilities,
  languageModel: (modelId: string) => LanguageModel,
): Provider {
  return { id, capabilities, languageModel };
}

/**
 * Factory dei provider (vedi ADR-0007/0010). Anthropic e OpenAI nativi;
 * "openai-compatible" via base URL copre OpenRouter, Vercel AI Gateway, Ollama,
 * LiteLLM, Groq, ecc.
 */
export function createProvider(settings: ProviderSettings): Provider {
  const { apiKey, baseURL } = settings;
  switch (settings.name) {
    case 'openai': {
      const openai = createOpenAI(apiKey ? { apiKey } : {});
      return make('openai', { vision: true, toolUse: true, streaming: true }, (m) => openai(m));
    }
    case 'openai-compatible': {
      const provider = createOpenAICompatible({
        name: 'openmate',
        baseURL: baseURL ?? '',
        ...(apiKey ? { apiKey } : {}),
      });
      return make('openai-compatible', { vision: false, toolUse: true, streaming: true }, (m) => provider(m));
    }
    default: {
      const anthropic = createAnthropic({
        ...(apiKey ? { apiKey } : {}),
        ...(baseURL ? { baseURL } : {}),
      });
      return make('anthropic', { vision: true, toolUse: true, streaming: true }, (m) => anthropic(m));
    }
  }
}
