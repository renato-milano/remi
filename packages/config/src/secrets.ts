import type { OpenMateConfig } from './schema.js';

export interface Secrets {
  apiKey?: string;
}

/**
 * Risolve i segreti dall'ambiente in base al provider configurato.
 * Tenuti fuori dal config object per non finire nei log/audit (docs/06).
 */
export function resolveSecrets(
  config: OpenMateConfig,
  env: NodeJS.ProcessEnv = process.env,
): Secrets {
  if (config.provider.name === 'anthropic') {
    return { apiKey: env.OPENMATE_ANTHROPIC_API_KEY ?? env.ANTHROPIC_API_KEY };
  }
  return { apiKey: env.OPENMATE_API_KEY };
}
