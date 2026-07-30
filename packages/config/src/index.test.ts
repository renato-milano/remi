import { describe, expect, it } from 'vitest';
import { defaultConfig, loadConfig, resolveSecrets } from './index.js';

describe('@openmate/config', () => {
  it('produce una config di default valida', () => {
    const cfg = defaultConfig();
    expect(cfg.provider.name).toBe('anthropic');
    expect(cfg.budget.maxSteps).toBeGreaterThan(0);
    expect(cfg.heartbeat.intervalMs).toBeGreaterThan(0);
    expect(cfg.storage.root).toBe('.');
  });

  it('applica gli override mantenendo i default annidati', () => {
    const cfg = loadConfig({ overrides: { provider: { model: 'claude-opus-4-8' } } });
    expect(cfg.provider.model).toBe('claude-opus-4-8');
    expect(cfg.provider.name).toBe('anthropic'); // default annidato preservato
  });

  it('rifiuta una config non valida', () => {
    expect(() => loadConfig({ overrides: { budget: { maxSteps: -1 } } })).toThrow();
  });

  it('legge i segreti dall\'ambiente, non dal config', () => {
    const cfg = defaultConfig();
    const secrets = resolveSecrets(cfg, { OPENMATE_ANTHROPIC_API_KEY: 'sk-test' });
    expect(secrets.apiKey).toBe('sk-test');
    expect(JSON.stringify(cfg)).not.toContain('sk-test');
  });
});
