import { existsSync, readFileSync } from 'node:fs';
import { type OpenMateConfig, configSchema } from './schema.js';

export interface LoadOptions {
  /** Percorso di un file JSON di configurazione (opzionale). */
  configPath?: string;
  /** Override applicati sopra il file (merge superficiale sui top-level). */
  overrides?: Record<string, unknown>;
}

/**
 * Carica e valida la configurazione. I segreti (chiavi API) NON stanno qui:
 * si leggono dall'ambiente con resolveSecrets() (vedi docs/06).
 */
export function loadConfig(opts: LoadOptions = {}): OpenMateConfig {
  const fileData: Record<string, unknown> =
    opts.configPath && existsSync(opts.configPath)
      ? JSON.parse(readFileSync(opts.configPath, 'utf8'))
      : {};
  const merged = { ...fileData, ...opts.overrides };
  return configSchema.parse(merged);
}

export function defaultConfig(): OpenMateConfig {
  return configSchema.parse({});
}
