import { z } from 'zod';

/** Provider LLM e modello (vedi docs/07, ADR-0007/0010). */
export const providerSchema = z.object({
  name: z.enum(['anthropic', 'openai', 'openai-compatible']).default('anthropic'),
  model: z.string().default('claude-sonnet-4-5'),
  /** Base URL per provider OpenAI-compatible (OpenRouter/Vercel/Ollama/LiteLLM…). */
  baseURL: z.string().url().optional(),
});

/** Budget di un ciclo cognitivo (anti loop-runaway, vedi docs/02). */
export const budgetSchema = z.object({
  maxSteps: z.number().int().positive().default(12),
  maxTokens: z.number().int().positive().optional(),
  wallClockMs: z.number().int().positive().default(120_000),
});

/** Policy di autonomia: cosa l'agente può fare senza chiedere (vedi docs/06). */
export const autonomySchema = z.object({
  shell: z
    .object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
    })
    .default({ allow: [], deny: [] }),
  files: z
    .object({
      allow: z.array(z.string()).default([]),
    })
    .default({ allow: [] }),
  /** Fin dove agire senza chiedere: none | read | write (il pericoloso chiede sempre). */
  autoApprove: z.enum(['none', 'read', 'write']).default('read'),
});

/** Heartbeat + cron (vedi docs/02). */
export const heartbeatSchema = z.object({
  intervalMs: z.number().int().positive().default(300_000),
  cron: z.array(z.string()).default([]),
});

export const storageSchema = z.object({
  /** Root local-first dello storage (openmate.db, memory/). */
  root: z.string().default('.'),
});

/** Controllo del computer (vision + mouse/tastiera). Default off. */
export const computerUseSchema = z.object({
  enabled: z.boolean().default(false),
});

/** Controllo del browser. Default off.
 *  - 'auto': sessione Playwright autonoma (browser suo, profilo persistente).
 *  - 'extension': pilota il Chrome LIVE via l'estensione OpenMate (i tuoi login). */
export const browserSchema = z.object({
  enabled: z.boolean().default(false),
  mode: z.enum(['auto', 'extension']).default('auto'),
  /** (mode auto) Mostra la finestra del browser (false = headless). */
  headed: z.boolean().default(true),
});

export const configSchema = z.object({
  provider: providerSchema.default({}),
  heartbeat: heartbeatSchema.default({}),
  autonomy: autonomySchema.default({}),
  budget: budgetSchema.default({}),
  storage: storageSchema.default({}),
  computerUse: computerUseSchema.default({}),
  browser: browserSchema.default({}),
});

export type ProviderConfig = z.infer<typeof providerSchema>;
export type BudgetConfig = z.infer<typeof budgetSchema>;
export type AutonomyConfig = z.infer<typeof autonomySchema>;
export type HeartbeatConfig = z.infer<typeof heartbeatSchema>;
export type OpenMateConfig = z.infer<typeof configSchema>;
