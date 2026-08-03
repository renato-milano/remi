import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { SubscriptionTokenProvider } from './claude-subscription.js';
import type { Provider, ProviderCapabilities } from './types.js';

export type ProviderName = 'anthropic' | 'openai' | 'openai-compatible';

export interface ProviderSettings {
  name: ProviderName;
  /** Base URL per i provider OpenAI-compatible (OpenRouter, Vercel, Ollama, LiteLLM…). */
  baseURL?: string;
  apiKey?: string;
  /**
   * Login con abbonamento Claude (Pro/Max): fornisce l'access token OAuth di
   * Claude Code al posto della API key. Valido solo con name === 'anthropic'.
   */
  subscription?: SubscriptionTokenProvider;
}

/**
 * Marker richiesto da Anthropic per i token di abbonamento: deve essere il primo
 * blocco system, altrimenti la richiesta è rifiutata con "This credential is only
 * authorized for use with Claude Code".
 */
export const CLAUDE_CODE_SYSTEM_PREFIX = "You are Claude Code, Anthropic's official CLI for Claude.";

/** Header che identificano un client Claude Code (necessari per i token OAuth). */
const OAUTH_BETA = 'oauth-2025-04-20,claude-code-20250219';
const CLAUDE_CLI_UA = 'claude-cli/1.0.0 (external, cli)';

function make(
  id: string,
  capabilities: ProviderCapabilities,
  languageModel: (modelId: string) => LanguageModel,
  systemPrefix?: string,
): Provider {
  return { id, capabilities, languageModel, systemPrefix };
}

/**
 * fetch che sostituisce l'auth a chiave con il Bearer OAuth dell'abbonamento e
 * aggiunge gli header che Claude si aspetta da Claude Code. Il token è risolto a
 * ogni richiesta (così cattura i refresh).
 */
export function subscriptionFetch(
  subscription: SubscriptionTokenProvider,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const token = await subscription.getToken();
    const headers = new Headers(init?.headers);
    headers.delete('x-api-key');
    headers.set('authorization', `Bearer ${token}`);
    headers.set('anthropic-beta', OAUTH_BETA);
    headers.set('user-agent', CLAUDE_CLI_UA);
    headers.set('x-app', 'cli');
    headers.set('anthropic-dangerous-direct-browser-access', 'true');
    return baseFetch(input, { ...init, headers });
  };
}

/**
 * Factory dei provider (vedi ADR-0007/0010). Anthropic e OpenAI nativi;
 * "openai-compatible" via base URL copre OpenRouter, Vercel AI Gateway, Ollama,
 * LiteLLM, Groq, ecc. Anthropic supporta anche il login con abbonamento (subscription).
 */
export function createProvider(settings: ProviderSettings): Provider {
  const { apiKey, baseURL, subscription } = settings;
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
      if (subscription) {
        // Modalità abbonamento Claude: auth via Bearer OAuth + marker Claude Code.
        const anthropic = createAnthropic({
          apiKey: 'oauth', // placeholder: l'auth reale è iniettata dal fetch custom
          fetch: subscriptionFetch(subscription),
        });
        return make(
          'anthropic',
          { vision: true, toolUse: true, streaming: true },
          (m) => anthropic(m),
          CLAUDE_CODE_SYSTEM_PREFIX,
        );
      }
      const anthropic = createAnthropic({
        ...(apiKey ? { apiKey } : {}),
        ...(baseURL ? { baseURL } : {}),
      });
      return make('anthropic', { vision: true, toolUse: true, streaming: true }, (m) => anthropic(m));
    }
  }
}
