import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Client sottile del daemon: REPL + stream SSE degli eventi (docs/08). */
const BASE = process.env.OPENMATE_URL ?? 'http://127.0.0.1:8787';

interface AgentEventLike {
  kind: string;
  content?: string;
  summary?: string;
  requestId?: string;
  request?: { summary?: string; details?: unknown; toolName?: string };
  state?: { status?: string };
}

async function postCommand(cmd: unknown): Promise<void> {
  try {
    await fetch(`${BASE}/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cmd),
    });
  } catch (err) {
    console.error('Invio comando fallito:', err);
  }
}

async function streamEvents(onEvent: (event: AgentEventLike) => void): Promise<void> {
  const res = await fetch(`${BASE}/events`);
  if (!res.body) throw new Error('nessuno stream eventi');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.slice('data:'.length).trim();
      if (!data) continue;
      try {
        onEvent(JSON.parse(data) as AgentEventLike);
      } catch {
        // ignora frame non-JSON (es. keep-alive)
      }
    }
  }
}

export async function main(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  streamEvents((event) => {
    switch (event.kind) {
      case 'message':
        console.log(`\n🤖 ${event.content}`);
        break;
      case 'action':
        console.log(`   · ${event.summary}`);
        break;
      case 'approval_request':
        console.log(`\n⚠️  Approvazione: ${event.request?.summary ?? event.request?.toolName}`);
        console.log(`   dettagli: ${JSON.stringify(event.request?.details)}`);
        rl.question('   Approvi? [y/N] ', (ans) => {
          void postCommand({
            kind: 'approval_decision',
            requestId: event.requestId,
            approved: /^y/i.test(ans.trim()),
          });
        });
        break;
      default:
        break;
    }
  }).catch((err) => console.error('Connessione eventi persa:', err));

  console.log(`OpenMate CLI → ${BASE}  ("/quit" per uscire)`);
  rl.on('line', (line) => {
    const text = line.trim();
    if (text === '/quit') {
      rl.close();
      process.exit(0);
    }
    if (text) void postCommand({ kind: 'user_message', content: text });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
