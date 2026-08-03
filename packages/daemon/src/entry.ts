import { main } from './index.js';

/**
 * Entry per il bundle esbuild (app pacchettizzata). A differenza di index.ts,
 * NON usa il main-guard `import.meta.url` (che non scatta in un bundle CJS):
 * chiama main() incondizionatamente.
 *
 * I moduli nativi (better-sqlite3, @nut-tree-fork/*, playwright-core) restano
 * esterni al bundle e si risolvono a runtime via NODE_PATH (vedi main.cjs). Se
 * NODE_PATH manca, il `require('better-sqlite3')` in cima al grafo fallisce
 * subito con un errore MODULE_NOT_FOUND esplicito.
 */
void main();
