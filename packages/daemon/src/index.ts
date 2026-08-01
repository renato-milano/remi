import { fileURLToPath } from 'node:url';
import { loadConfig, resolveSecrets } from '@openmate/config';
import { Daemon } from './daemon.js';
import { startHttpServer } from './server.js';

export { Daemon, type DaemonOptions, type DaemonEvent } from './daemon.js';
export { SqliteAuditSink } from './audit-sqlite.js';
export { startHttpServer, type ClientCommand } from './server.js';

// Rete di sicurezza: un errore non gestito non deve far crashare il daemon.
process.on('unhandledRejection', (reason) => console.error('[daemon] unhandledRejection:', reason));
process.on('uncaughtException', (err) => console.error('[daemon] uncaughtException:', err));

/** Entrypoint: carica config, monta il daemon, avvia scheduler e HTTP. */
export async function main(): Promise<void> {
  const config = loadConfig({ configPath: process.env.OPENMATE_CONFIG });
  const secrets = resolveSecrets(config);
  const daemon = new Daemon({ config, secrets, configPath: process.env.OPENMATE_CONFIG });
  daemon.start();
  const port = Number(process.env.OPENMATE_PORT ?? 8787);
  startHttpServer(daemon, port);
  if (!secrets.apiKey) {
    console.warn('⚠️  Nessuna chiave API (OPENMATE_ANTHROPIC_API_KEY): i cicli LLM falliranno.');
  }
  console.log(`OpenMate daemon in ascolto su http://127.0.0.1:${port}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
