import { fileURLToPath } from 'node:url';

export const PACKAGE_NAME = '@openmate/daemon';

// TODO(MVP): API locale (Hono/http) + SSE event stream; monta tutto — vedi docs/11-mvp-implementation-plan.md
export function main(): void {
  console.log('OpenMate daemon — stub (M0). Vedi docs/11-mvp-implementation-plan.md');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
