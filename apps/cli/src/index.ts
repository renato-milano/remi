import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = '@openmate/cli';

// TODO(MVP): client sottile: REPL + SSE, invia comandi, mostra eventi — vedi docs/11-mvp-implementation-plan.md
export function main(): void {
  console.log('OpenMate cli — stub (M0). Vedi docs/11-mvp-implementation-plan.md');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
