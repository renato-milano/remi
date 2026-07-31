/**
 * Demo-mode: un daemon con backend finto (nessuna chiave API) che risponde ai
 * messaggi e avvia cicli periodici, così l'overlay UI si anima tra gli stati.
 * Avvio:  pnpm --filter @openmate/ui demo   (poi, a parte:  pnpm --filter @openmate/ui dev)
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../../../packages/config/dist/index.js';
import { Daemon, startHttpServer } from '../../../packages/daemon/dist/index.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = () => Math.random().toString(36).slice(2, 7);

const REPLIES = [
  'Ciao! Sono qui 🙂',
  'Tutto sotto controllo da questa parte.',
  'Ricevuto, ci penso io.',
  'Detto fatto ✨',
  'Sono in modalità demo, ma reagisco a quello che scrivi!',
];
function reply(userText) {
  const tail = REPLIES[Math.floor(Math.random() * REPLIES.length)];
  return userText && userText.length < 70 ? `Hai scritto: “${userText}”. ${tail}` : tail;
}

async function* callTool(input, name, args) {
  const toolCallId = `c${rnd()}`;
  yield { type: 'tool-call', toolCallId, toolName: name, input: args };
  const tool = input.tools?.[name];
  const output = tool?.execute
    ? await tool.execute(args, { toolCallId, messages: input.messages })
    : undefined;
  yield { type: 'tool-result', toolCallId, toolName: name, output };
}

class DemoBackend {
  id = 'demo';
  async *run(input) {
    const last = input.messages[input.messages.length - 1]?.content;
    const userText = typeof last === 'string' ? last : '';
    await delay(600);
    const roll = Math.random();

    if (roll < 0.12) {
      // scenario approvazione (comando non allowlisted → mostra la card)
      yield* callTool(input, 'shell.run', { command: 'ls -la /tmp' });
      await delay(250);
      yield { type: 'text-delta', text: 'Ok, ho dato un occhio ai file temporanei.' };
    } else if (roll < 0.4) {
      // salva in memoria (nessuna approvazione)
      yield* callTool(input, 'memory.write', {
        name: `nota-${Date.now()}`,
        description: 'demo',
        body: userText || 'promemoria di prova',
      });
      await delay(200);
      yield { type: 'text-delta', text: `Annotato in memoria. ${reply(userText)}` };
    } else {
      // echo allowlisted + risposta
      yield* callTool(input, 'shell.run', { command: 'echo ok' });
      await delay(200);
      yield { type: 'text-delta', text: reply(userText) };
    }
    yield { type: 'finish', finishReason: 'stop', usage: {} };
  }
}

const root = join(tmpdir(), 'openmate-demo');
mkdirSync(root, { recursive: true });
const config = defaultConfig();
config.storage.root = root;
config.autonomy.shell.allow = ['echo']; // 'ls' resta fuori → mostra l'approvazione
config.heartbeat.intervalMs = 10_000_000;

const daemon = new Daemon({ config, backend: new DemoBackend() });
daemon.start();
startHttpServer(daemon, 8787);
console.log('OpenMate DEMO daemon su http://127.0.0.1:8787 (storage:', root, ')');

// ogni tanto si "sveglia" da solo (piccola vita)
const prompts = ['(check periodico)', '(manutenzione)', '(tutto ok?)'];
let i = 0;
setInterval(() => {
  void daemon.submitUserMessage(prompts[i++ % prompts.length]);
}, 14000);
