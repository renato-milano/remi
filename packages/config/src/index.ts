export { loadConfig, defaultConfig, type LoadOptions } from './config.js';
export { resolveSecrets, type Secrets } from './secrets.js';
export {
  configSchema,
  providerSchema,
  budgetSchema,
  autonomySchema,
  heartbeatSchema,
  storageSchema,
  voiceSchema,
  type OpenMateConfig,
  type ProviderConfig,
  type BudgetConfig,
  type AutonomyConfig,
  type HeartbeatConfig,
  type VoiceConfig,
} from './schema.js';
