import { describe, expect, it, vi } from 'vitest';
import { isExpiring, refreshAccessToken } from './claude-subscription.js';
import { CLAUDE_CODE_SYSTEM_PREFIX, createProvider, subscriptionFetch } from './providers.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('@openmate/llm — claude-subscription', () => {
  it('isExpiring: true entro il margine, false se lontano', () => {
    const now = 1_000_000;
    expect(isExpiring({ accessToken: 'a', refreshToken: 'r', expiresAt: now + 10_000 }, now)).toBe(true);
    expect(isExpiring({ accessToken: 'a', refreshToken: 'r', expiresAt: now + 300_000 }, now)).toBe(false);
  });

  it('refreshAccessToken: salta gli host 404 e ruota il refresh token', async () => {
    const calls: string[] = [];
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      // il primo host risponde 404 (stale) → deve provare il successivo
      if (u.includes('platform.claude.com')) return new Response('not found', { status: 404 });
      return jsonResponse({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 });
    }) as unknown as typeof fetch;

    const out = await refreshAccessToken('old-refresh', fakeFetch);
    expect(out).not.toBeNull();
    expect(out?.accessToken).toBe('new-access');
    expect(out?.refreshToken).toBe('new-refresh'); // ruotato
    expect(calls[0]).toContain('platform.claude.com'); // ordine di preferenza
    expect(calls.length).toBeGreaterThanOrEqual(2); // ha fatto fallback dopo il 404
  });

  it('refreshAccessToken: se il server non ritorna un nuovo refresh, tiene il vecchio', async () => {
    const fakeFetch = vi.fn(async () =>
      jsonResponse({ access_token: 'a2', expires_in: 60 }),
    ) as unknown as typeof fetch;
    const out = await refreshAccessToken('keep-me', fakeFetch);
    expect(out?.refreshToken).toBe('keep-me');
  });
});

describe('@openmate/llm — subscription provider', () => {
  it('subscriptionFetch: inietta il Bearer OAuth e toglie x-api-key', async () => {
    let seen: Headers | undefined;
    const baseFetch = vi.fn(async (_input: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers);
      return new Response('ok');
    }) as unknown as typeof fetch;

    const wrapped = subscriptionFetch({ getToken: async () => 'tok-123' }, baseFetch);
    await wrapped('https://api.anthropic.com/v1/messages', {
      headers: { 'x-api-key': 'should-be-removed', 'content-type': 'application/json' },
    });

    expect(seen?.get('authorization')).toBe('Bearer tok-123');
    expect(seen?.has('x-api-key')).toBe(false);
    expect(seen?.get('anthropic-beta')).toContain('oauth-2025-04-20');
    expect(seen?.get('x-app')).toBe('cli');
    expect(seen?.get('user-agent')).toContain('claude-cli/');
  });

  it('createProvider in modalità subscription espone il marker system Claude Code', () => {
    const provider = createProvider({
      name: 'anthropic',
      subscription: { getToken: async () => 'x' },
    });
    expect(provider.id).toBe('anthropic');
    expect(provider.capabilities.vision).toBe(true);
    expect(provider.systemPrefix).toBe(CLAUDE_CODE_SYSTEM_PREFIX);
  });

  it('createProvider senza subscription non imposta il marker', () => {
    const provider = createProvider({ name: 'anthropic', apiKey: 'sk-ant-x' });
    expect(provider.systemPrefix).toBeUndefined();
  });
});
