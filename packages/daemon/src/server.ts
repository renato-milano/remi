import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import type { Daemon } from './daemon.js';

export type ClientCommand =
  | { kind: 'user_message'; content: string }
  | { kind: 'approval_decision'; requestId: string; approved: boolean }
  | { kind: 'interrupt' };

/** Wrapper HTTP locale: SSE per gli eventi + POST per i comandi (docs/08). */
export function startHttpServer(daemon: Daemon, port: number) {
  const app = new Hono();

  // L'overlay UI gira da file:// (origin nullo): CORS aperto in locale.
  app.use('*', cors());

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const unsubscribe = daemon.onEvent((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      stream.onAbort(() => unsubscribe());
      while (!stream.aborted) {
        await stream.sleep(15_000);
      }
    }),
  );

  app.post('/command', async (c) => {
    const cmd = (await c.req.json()) as ClientCommand;
    switch (cmd.kind) {
      case 'user_message':
        void daemon.submitUserMessage(cmd.content);
        return c.json({ ok: true });
      case 'approval_decision':
        daemon.resolveApproval(cmd.requestId, cmd.approved);
        return c.json({ ok: true });
      case 'interrupt':
        return c.json({ ok: true });
      default:
        return c.json({ ok: false, error: 'comando sconosciuto' }, 400);
    }
  });

  return serve({ fetch: app.fetch, port });
}
