import { execFile } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);

/**
 * Login con abbonamento Claude (Pro/Max) riusando le credenziali di Claude Code.
 *
 * NON è un flusso OAuth nostro: leggiamo (e all'occorrenza rinfreschiamo) il
 * token OAuth che Claude Code ha già ottenuto al login. Claude Code resta
 * l'unica fonte di verità: dopo un refresh riscriviamo lì il refresh_token
 * (che ruota) per non desincronizzarci.
 *
 * ⚠️ Modalità avanzata/opt-in: l'uso di token di abbonamento da app terze è
 * contro le policy Anthropic (feb 2026) e in parte applicato lato server
 * (marker system-prompt "Claude Code", user-agent claude-cli, ecc.). Vedi il
 * piano e providers.ts per gli header richiesti.
 */

/** client_id pubblico di Claude Code (PKCE, nessun secret). */
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

/** Host del token endpoint in ordine di preferenza (il primo che risponde vince). */
const TOKEN_ENDPOINTS = [
  'https://platform.claude.com/v1/oauth/token',
  'https://console.anthropic.com/v1/oauth/token',
  'https://claude.ai/v1/oauth/token',
];

/** Servizio Keychain macOS usato da Claude Code. */
const KEYCHAIN_SERVICE = 'Claude Code-credentials';

/** Rinnova il token se scade entro questo margine. */
const REFRESH_MARGIN_MS = 60_000;

export interface ClaudeCreds {
  accessToken: string;
  refreshToken: string;
  /** Scadenza dell'access token, epoch in ms. */
  expiresAt: number;
  scopes?: string[];
}

interface RawStore {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scopes?: string[];
  };
}

function credentialsFilePath(): string {
  return join(homedir(), '.claude', '.credentials.json');
}

function parseStore(text: string): ClaudeCreds | null {
  let raw: RawStore;
  try {
    raw = JSON.parse(text) as RawStore;
  } catch {
    return null;
  }
  const o = raw.claudeAiOauth;
  if (!o?.accessToken || !o.refreshToken || typeof o.expiresAt !== 'number') return null;
  return {
    accessToken: o.accessToken,
    refreshToken: o.refreshToken,
    expiresAt: o.expiresAt,
    scopes: o.scopes,
  };
}

async function readKeychain(): Promise<string | null> {
  if (process.platform !== 'darwin') return null;
  try {
    const account = userInfo().username;
    const { stdout } = await pExecFile('security', [
      'find-generic-password',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
      '-w',
    ]);
    const text = stdout.trim();
    return text.length ? text : null;
  } catch {
    return null;
  }
}

async function writeKeychain(text: string): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const account = userInfo().username;
    // -U aggiorna la voce se esiste già.
    await pExecFile('security', [
      'add-generic-password',
      '-U',
      '-s',
      KEYCHAIN_SERVICE,
      '-a',
      account,
      '-w',
      text,
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Legge le credenziali di Claude Code: prima il file `~/.claude/.credentials.json`,
 * poi (macOS) il Keychain. Ritorna null se Claude Code non è loggato.
 */
export async function readClaudeCredentials(): Promise<ClaudeCreds | null> {
  try {
    const fromFile = parseStore(readFileSync(credentialsFilePath(), 'utf8'));
    if (fromFile) return fromFile;
  } catch {
    /* file assente/illeggibile: prova il Keychain */
  }
  const kc = await readKeychain();
  return kc ? parseStore(kc) : null;
}

/**
 * Riscrive le credenziali dove le tiene Claude Code (Keychain su macOS, altrimenti
 * file, riscrittura atomica). Best-effort: se fallisce, il token in memoria resta
 * comunque utilizzabile fino alla scadenza.
 */
export async function writeClaudeCredentials(creds: ClaudeCreds): Promise<void> {
  const payload = JSON.stringify({
    claudeAiOauth: {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken,
      expiresAt: creds.expiresAt,
      scopes: creds.scopes ?? [],
    },
  });
  if (await writeKeychain(payload)) return;
  try {
    const file = credentialsFilePath();
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, payload, { mode: 0o600 });
    renameSync(tmp, file);
  } catch {
    /* best-effort */
  }
}

/**
 * Parte "pura" del refresh: chiama il token endpoint (con fallback di host) e
 * ritorna le nuove credenziali, senza riscrivere nulla. fetch iniettabile per i test.
 */
export async function refreshAccessToken(
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClaudeCreds | null> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  }).toString();

  let lastErr: unknown;
  for (const url of TOKEN_ENDPOINTS) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body,
      });
      if (res.status === 404) continue; // host stale: prova il prossimo
      if (!res.ok) {
        lastErr = new Error(`refresh ${res.status} su ${url}`);
        continue;
      }
      const json = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
      };
      if (!json.access_token) {
        lastErr = new Error(`refresh senza access_token su ${url}`);
        continue;
      }
      return {
        accessToken: json.access_token,
        // il refresh_token ruota: usa il nuovo se presente, altrimenti tieni il vecchio
        refreshToken: json.refresh_token ?? refreshToken,
        expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr) throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  return null;
}

/** True se l'access token è scaduto o sta per scadere. */
export function isExpiring(creds: ClaudeCreds, now = Date.now()): boolean {
  return creds.expiresAt - now < REFRESH_MARGIN_MS;
}

/**
 * Rinnova il token se in scadenza e riscrive le credenziali (rotazione del
 * refresh_token). Se non serve rinnovare, ritorna le credenziali invariate.
 */
export async function refreshIfNeeded(creds: ClaudeCreds): Promise<ClaudeCreds> {
  if (!isExpiring(creds)) return creds;
  const refreshed = await refreshAccessToken(creds.refreshToken);
  if (!refreshed) return creds;
  const next: ClaudeCreds = { ...refreshed, scopes: creds.scopes };
  await writeClaudeCredentials(next);
  return next;
}

export interface SubscriptionTokenProvider {
  /** Ritorna un access token valido, rinnovando e ri-leggendo da disco se serve. */
  getToken(): Promise<string>;
}

/**
 * Fornisce l'access token per il provider anthropic in modalità subscription.
 * Rilegge da disco a ogni giro (così cattura i refresh fatti da una sessione
 * Claude Code parallela) e rinnova quando in scadenza.
 */
export function makeSubscriptionTokenProvider(): SubscriptionTokenProvider {
  let cached: ClaudeCreds | null = null;
  return {
    async getToken(): Promise<string> {
      // Rileggi sempre da disco: Claude Code potrebbe aver già ruotato il token.
      const onDisk = await readClaudeCredentials();
      const base = onDisk ?? cached;
      if (!base) {
        throw new Error(
          'Claude Code non è loggato. Apri il terminale ed esegui "claude" (login) oppure "claude setup-token".',
        );
      }
      cached = await refreshIfNeeded(base);
      return cached.accessToken;
    },
  };
}

/** Stato del login per la UI: non rinnova, controlla solo presenza/scadenza. */
export async function probeClaudeLogin(): Promise<{ loggedIn: boolean; expiresAt?: number }> {
  const creds = await readClaudeCredentials();
  if (!creds) return { loggedIn: false };
  return { loggedIn: true, expiresAt: creds.expiresAt };
}
