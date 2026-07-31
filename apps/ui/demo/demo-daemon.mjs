/**
 * Demo-mode: un daemon con backend finto (nessuna chiave API) che avvia cicli
 * periodici, così l'overlay UI si anima attraverso gli stati.
 * Avvio:  pnpm --filter @openmate/ui demo   (poi, a parte:  pnpm --filter @openmate/ui dev)
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../../../packages/config/dist/index.js';
import { Daemon, startHttpServer } from '../../../packages/daemon/dist/index.js';

const scenarios = [
  { text: 'Ho controllato lo stato: tutto ok. ✅', tools: [['shell.run', { command: 'echo tutto ok' }]] },
  { text: 'Fatto, ho salvato la nota in memoria.', tools: [['memory.write', { name: `nota-${Date.now()}`, description: 'demo', body: `promemoria ${Math.random().toString(36).slice(2, 7)}` }]] },
  { text: 'Vorrei dare un occhio ai file temporanei.', tools: [['shell.run', { command: 'ls -la /tmp' }]] }, // non allowlisted → chiede
  { text: 'Sto solo qui, se ti serve qualcosa chiedimi pure.', tools: [] },
];

class DemoBackend {
  id = 'demo';
  async *run(input) {
    const sc = scenarios[Math.floor(Math.random() * scenarios.length)];
    await new Promise((r) => setTimeout(r, 700)); // "pensa"
    for (const [name, args] of sc.tools) {
      const toolCallId = `c${Math.random().toString(36).slice(2, 7)}`;
      yield { type: 'tool-call', toolCallId, toolName: name, input: args };
      const tool = input.tools?.[name];
      const output = tool?.execute
        ? await tool.execute(args, { toolCallId, messages: input.messages })
        : undefined;
      yield { type: 'tool-result', toolCallId, toolName: name, output };
      await new Promise((r) => setTimeout(r, 400));
    }
    yield { type: 'text-delta', text: sc.text };
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

const prompts = ['ciao!', 'come va?', 'fai un check', 'ricordati questa cosa', 'guarda i log'];
let i = 0;
setInterval(() => {
  void daemon.submitUserMessage(prompts[i++ % prompts.length]);
}, 9000);
