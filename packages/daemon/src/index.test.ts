import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '@openmate/config';
import { FakeReasoningBackend } from '@openmate/llm';
import type { ReasoningBackend } from '@openmate/llm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Daemon, type DaemonEvent } from './index.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openmate-daemon-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeDaemon(backend: ReasoningBackend): Daemon {
  const config = defaultConfig();
  config.storage.root = root;
  config.autonomy.shell.allow = ['echo'];
  config.heartbeat.intervalMs = 10_000_000; // heartbeat inerte nei test
  return new Daemon({ config, backend });
}

describe('@openmate/daemon — end-to-end (FakeBackend)', () => {
  it('un messaggio utente avvia un ciclo: eventi, memoria e audit', async () => {
    const backend = new FakeReasoningBackend([
      { callTool: 'memory.log', input: { kind: 'observation', actor: 'agent', content: 'ricordo zorkmid' } },
      { text: 'Fatto.' },
    ]);
    const daemon = makeDaemon(backend);
    const events: DaemonEvent[] = [];
    daemon.onEvent((e) => events.push(e));

    await daemon.submitUserMessage('ciao');

    expect(events.some((e) => e.kind === 'message')).toBe(true);
    expect(daemon.memory.search('zorkmid', { scope: 'episodic' }).length).toBeGreaterThan(0);
    expect(daemon.auditCount()).toBeGreaterThan(0);
    daemon.stop();
  });

  it('instrada l\'approvazione: comando pericoloso negato non esegue', async () => {
    const backend = new FakeReasoningBackend([
      { callTool: 'shell.run', input: { command: 'rm -rf /tmp/openmate-nope' } },
      { text: 'ok' },
    ]);
    const daemon = makeDaemon(backend);
    let approval: Extract<DaemonEvent, { kind: 'approval_request' }> | undefined;
    daemon.onEvent((e) => {
      if (e.kind === 'approval_request') {
        approval = e;
        daemon.resolveApproval(e.requestId, false); // nega
      }
    });

    await daemon.submitUserMessage('vai');

    expect(approval).toBeDefined();
    expect(approval?.request.toolName).toBe('shell.run');
    daemon.stop();
  });

  it('ricorda tra i riavvii', async () => {
    const d1 = makeDaemon(
      new FakeReasoningBackend([
        { callTool: 'memory.write', input: { name: 'ricordo', body: 'grotta di plover' } },
        { text: 'salvato' },
      ]),
    );
    await d1.submitUserMessage('salva');
    d1.stop();

    const d2 = makeDaemon(new FakeReasoningBackend([{ text: 'ciao' }]));
    expect(d2.memory.search('plover', { scope: 'semantic' }).length).toBeGreaterThan(0);
    d2.stop();
  });
});
