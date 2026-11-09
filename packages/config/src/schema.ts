import { z } from 'zod';

/** Provider LLM e modello (vedi docs/07, ADR-0007/0010). */
export const providerSchema = z.object({
  name: z.enum(['anthropic', 'openai', 'openai-compatible']).default('anthropic'),
  model: z.string().default('claude-sonnet-4-5'),
  /**
   * Modello per i turni che costruiscono un modello 3D (richiesta esplicita di 3D) e per le chiamate
   * collegate (dettagli, revisione con la vista, riparazioni). Stesso provider; se manca vale `model`.
   */
  sceneModel: z.string().optional(),
  /** Ragionamento nei turni 3D: "high" (default, pianifica meglio) o "low" (molto più rapido). */
  sceneEffort: z.enum(['high', 'low']).optional(),
  /** Base URL per provider OpenAI-compatible (OpenRouter/Vercel/Ollama/LiteLLM…). */
  baseURL: z.string().url().optional(),
  /**
   * Come autenticarsi:
   *  - 'api-key': chiave a consumo (default).
   *  - 'claude-subscription': riusa il login di Claude Code (abbonamento Pro/Max),
   *    valido solo con name === 'anthropic'. Modalità avanzata/opt-in.
   */
  auth: z.enum(['api-key', 'claude-subscription']).default('api-key'),
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

/** Voce: parli tenendo premuta la hotkey "indica", Remi risponde anche a voce. Default off
 *  (il modello di trascrizione locale va scaricato: ~465 MB). */
export const voiceSchema = z.object({
  enabled: z.boolean().default(false),
  /** Trascrizione: 'local' = whisper.cpp sul dispositivo (ripiego cloud se manca), 'cloud' = gateway. */
  stt: z.enum(['local', 'cloud']).default('local'),
  model: z.enum(['small']).default('small'),
  /** Lingua parlata ('it', 'en', … o 'auto'). */
  language: z.string().default('it'),
  /**
   * Ascolta "Hey Remi" anche senza tasto. Il microfono resta aperto; l'audio è
   * analizzato SOLO in locale (whisper.cpp), mai inviato in rete.
   */
  wakeWord: z.boolean().default(false),
  /** Voce di Remi: 'auto' = cloud se c'è il gateway, altrimenti voce di sistema. */
  tts: z.enum(['auto', 'cloud', 'system', 'off']).default('auto'),
  /**
   * Trascrizione delle DOMANDE (hotkey o dopo "Hey Remi"): un modello del gateway, molto più
   * preciso del whisper locale sui nomi; 'local' = sempre whisper locale. L'ascolto di
   * "Hey Remi" resta comunque locale. MAI Transcribe 2 misurato via gateway su frasi italiane
   * con nomi propri, anche con voce di sottofondo: ~0,7 s e nomi giusti ("Lucio Dalla", "DJ Neo")
   * dove whisper small sbaglia; Scribe v2 e Grok STT simili, gpt-4o-transcribe peggiore.
   */
  questionModel: z.string().default('microsoft/mai-transcribe-2'),
});

export const configSchema = z.object({
  provider: providerSchema.default({}),
  heartbeat: heartbeatSchema.default({}),
  autonomy: autonomySchema.default({}),
  budget: budgetSchema.default({}),
  storage: storageSchema.default({}),
  computerUse: computerUseSchema.default({}),
  browser: browserSchema.default({}),
  voice: voiceSchema.default({}),
});

export type ProviderConfig = z.infer<typeof providerSchema>;
export type BudgetConfig = z.infer<typeof budgetSchema>;
export type AutonomyConfig = z.infer<typeof autonomySchema>;
export type HeartbeatConfig = z.infer<typeof heartbeatSchema>;
export type VoiceConfig = z.infer<typeof voiceSchema>;
export type OpenMateConfig = z.infer<typeof configSchema>;
