import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { WebSocketServer } from 'ws';
import type { Daemon } from './daemon.js';

export type ClientCommand =
  | { kind: 'user_message'; content: string }
  | { kind: 'approval_decision'; requestId: string; approved: boolean; always?: boolean }
  | { kind: 'interrupt' }
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'cancel_schedule'; id: string }
  | { kind: 'set_heartbeat'; seconds: number }
  | { kind: 'create_schedule'; cron: string; instruction: string; title?: string };

/** Wrapper HTTP locale: SSE per gli eventi + POST per i comandi (docs/08). */
export function startHttpServer(daemon: Daemon, port: number) {
  const app = new Hono();

  // L'overlay UI gira da file:// (origin nullo): CORS aperto in locale.
  app.use('*', cors());

  app.get('/health', (c) => c.json({ ok: true }));

  // Stato per overlay/dashboard: computer-use, heartbeat, n. task ricorrenti.
  app.get('/status', (c) =>
    c.json({
      computerUse: daemon.computerUse,
      heartbeatSeconds: daemon.heartbeatSeconds(),
      scheduleCount: daemon.listSchedules().length,
      paused: daemon.isPaused(),
    }),
  );

  // Dashboard: task ricorrenti e log recente.
  app.get('/schedules', (c) => c.json({ schedules: daemon.listSchedules() }));
  app.get('/log', (c) => {
    const n = Number(c.req.query('n') ?? 50);
    return c.json({ entries: daemon.recentLog(Number.isFinite(n) ? n : 50) });
  });

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
        daemon.resolveApproval(cmd.requestId, cmd.approved, cmd.always ?? false);
        return c.json({ ok: true });
      case 'interrupt':
        daemon.interrupt();
        return c.json({ ok: true });
      case 'pause':
        daemon.pause();
        return c.json({ ok: true });
      case 'resume':
        daemon.resume();
        return c.json({ ok: true });
      case 'cancel_schedule':
        return c.json({ ok: daemon.cancelSchedule(cmd.id) });
      case 'set_heartbeat':
        daemon.setHeartbeat(cmd.seconds);
        return c.json({ ok: true, heartbeatSeconds: daemon.heartbeatSeconds() });
      case 'create_schedule': {
        if (!daemon.isValidCron(cmd.cron)) return c.json({ ok: false, error: 'cron non valido' }, 400);
        const s = daemon.createSchedule({ cron: cmd.cron, instruction: cmd.instruction, title: cmd.title });
        return c.json({ ok: true, schedule: s });
      }
      default:
        return c.json({ ok: false, error: 'comando sconosciuto' }, 400);
    }
  });

  const server = serve({ fetch: app.fetch, port });
  // Relay per l'estensione Chrome (browser mode 'extension'): la scheda si collega qui.
  const wss = new WebSocketServer({ server: server as unknown as import('node:http').Server, path: '/ext' });
  wss.on('connection', (socket) => daemon.attachExtensionSocket(socket));
  return server;
}
