import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemory } from '@openmate/memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Executor } from '@openmate/computer';
import {
  type AutonomyPolicy,
  InMemoryAuditSink,
  ToolRegistry,
  createComputerTools,
  createMemoryTools,
  createToolContext,
  explainCommand,
  shellRunTool,
} from './index.js';

const policy: AutonomyPolicy = {
  shell: { allow: ['echo'], deny: ['rm'] },
  files: { allow: [] },
};

describe('@openmate/tools — shell.run gate + audit', () => {
  let audit: InMemoryAuditSink;
  let registry: ToolRegistry;

  beforeEach(() => {
    audit = new InMemoryAuditSink();
    registry = new ToolRegistry().register(shellRunTool);
  });

  it('esegue un comando allowlisted senza chiedere approvazione', async () => {
    let asked = 0;
    const ctx = createToolContext({
      audit,
      requestApproval: async () => {
        asked += 1;
        return false;
      },
    });
    const out = (await registry.execute('shell.run', { command: 'echo hi' }, ctx, policy)) as {
      code: number;
      stdout: string;
    };
    expect(asked).toBe(0);
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('hi');
    expect(audit.entries.at(-1)).toMatchObject({ tool: 'shell.run', decision: 'auto', outcome: 'ok' });
  });

  it('richiede approvazione per un comando pericoloso e, se negata, non esegue', async () => {
    let asked = 0;
    const ctx = createToolContext({
      audit,
      requestApproval: async () => {
        asked += 1;
        return false;
      },
    });
    const out = (await registry.execute(
      'shell.run',
      { command: 'rm -rf /tmp/openmate-nope' },
      ctx,
      policy,
    )) as { denied?: boolean };
    expect(asked).toBe(1);
    expect(out.denied).toBe(true);
    expect(audit.entries.at(-1)).toMatchObject({ tool: 'shell.run', decision: 'denied' });
  });

  it('con fiducia "read" auto-approva le letture, ma non i pericolosi', async () => {
    const readPolicy: AutonomyPolicy = { shell: { allow: [], deny: [] }, files: { allow: [] }, autoApprove: 'read' };
    let asked = 0;
    const ctx = createToolContext({
      audit,
      requestApproval: async () => {
        asked += 1;
        return false;
      },
    });
    // 'echo' → rischio read → auto (nessuna richiesta)
    const out = (await registry.execute('shell.run', { command: 'echo ciao' }, ctx, readPolicy)) as {
      code: number;
    };
    expect(asked).toBe(0);
    expect(out.code).toBe(0);
    // 'rm -rf' → dangerous → chiede comunque
    await registry.execute('shell.run', { command: 'rm -rf /tmp/openmate-nope' }, ctx, readPolicy);
    expect(asked).toBe(1);
  });

  it('esegue dopo approvazione un comando non allowlisted', async () => {
    const ctx = createToolContext({ audit, requestApproval: async () => true });
    const out = (await registry.execute('shell.run', { command: 'printf ok' }, ctx, policy)) as {
      code: number;
      stdout: string;
    };
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('ok');
    expect(audit.entries.at(-1)).toMatchObject({ decision: 'approved', outcome: 'ok' });
  });
});

describe('@openmate/tools — memory tools', () => {
  let root: string;
  let mem: ReturnType<typeof createMemory>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openmate-tools-'));
    mem = createMemory(root);
  });
  afterEach(() => {
    mem.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('scrive e cerca una nota tramite i tool', async () => {
    const registry = new ToolRegistry().registerAll(createMemoryTools(mem));
    const ctx = createToolContext({
      audit: new InMemoryAuditSink(),
      requestApproval: async () => true,
    });
    await registry.execute(
      'memory.write',
      { name: 'nota-tool', description: 'via tool', body: 'contenuto cercabile blorple' },
      ctx,
      policy,
    );
    const res = (await registry.execute(
      'memory.search',
      { query: 'blorple', scope: 'semantic' },
      ctx,
      policy,
    )) as { hits: { ref: unknown }[] };
    expect(res.hits.length).toBeGreaterThan(0);
    expect(res.hits[0]?.ref).toEqual({ kind: 'semantic', name: 'nota-tool' });
  });
});

describe('@openmate/tools — explainCommand', () => {
  it('spiega un comando di lettura in modo breve', () => {
    const e = explainCommand('ls -la /tmp');
    expect(e.level).toBe('read');
    expect(e.known).toBe(true);
    expect(e.text.toLowerCase()).toContain('guardare i file');
  });

  it('classifica come pericoloso rm -rf e sudo', () => {
    expect(explainCommand('rm -rf /tmp/x').level).toBe('dangerous');
    expect(explainCommand('rm -rf /tmp/x').text.toLowerCase()).toContain('eliminare');
    expect(explainCommand('sudo rm -rf /').level).toBe('dangerous');
  });

  it('riassume una pipe con l\'azione principale (niente elenchi)', () => {
    const pipe = explainCommand('grep -i error app.log | tail -1');
    expect(pipe.level).toBe('read');
    expect(pipe.text.toLowerCase()).toContain('cercare');
    expect(pipe.text).not.toContain('poi');
  });

  it('descrive l\'azione a rischio più alto in un fallback', () => {
    const e = explainCommand('ls ~/Desktop || rm -rf /tmp/x');
    expect(e.level).toBe('dangerous');
    expect(e.text.toLowerCase()).toContain('eliminare');
  });

  it('segnala i comandi sconosciuti', () => {
    const unknown = explainCommand('frobnicate --xyz');
    expect(unknown.known).toBe(false);
    expect(unknown.level).toBe('unknown');
  });
});

describe('@openmate/tools — AI SDK adapter', () => {
  it('espone i tool come ToolSet', () => {
    const registry = new ToolRegistry().register(shellRunTool);
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
    const set = registry.toAiToolSet(ctx, policy);
    // nome sul filo sanificato (niente punti): compatibile con Anthropic
    expect(Object.keys(set)).toContain('shell_run');
    expect(Object.keys(set)).not.toContain('shell.run');
  });

  it('i nomi sul filo rispettano il pattern dei provider (^[A-Za-z0-9_-]+$)', () => {
    const registry = new ToolRegistry()
      .register(shellRunTool)
      .registerAll(createComputerTools(fakeComputerExecutor()));
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
    const set = registry.toAiToolSet(ctx, policy);
    for (const name of Object.keys(set)) expect(name).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
  });
});

function fakeComputerExecutor(): Executor {
  return {
    capabilities: () => ({ supported: true, platform: 'darwin' }),
    screenshot: async () => ({ pngBase64: 'AAAA', width: 100, height: 80 }),
    move: async () => {},
    click: async () => {},
    doubleClick: async () => {},
    type: async () => {},
    key: async () => {},
    scroll: async () => {},
  };
}

describe('@openmate/tools — computer.* gate di sessione', () => {
  const fakeExecutor = (): Executor => ({
    capabilities: () => ({ supported: true, platform: 'darwin' }),
    screenshot: async () => ({ pngBase64: 'AAAA', width: 100, height: 80 }),
    move: async () => {},
    click: async () => {},
    doubleClick: async () => {},
    type: async () => {},
    key: async () => {},
    scroll: async () => {},
  });

  it('chiede l\'approvazione una sola volta per ciclo, poi auto-approva', async () => {
    const audit = new InMemoryAuditSink();
    let asked = 0;
    const ctx = createToolContext({
      audit,
      requestApproval: async () => {
        asked += 1;
        return true;
      },
    });
    const registry = new ToolRegistry().registerAll(createComputerTools(fakeExecutor()));

    await registry.execute('computer.screenshot', {}, ctx, policy);
    await registry.execute('computer.click', { x: 10, y: 20 }, ctx, policy);
    await registry.execute('computer.type', { text: 'ciao' }, ctx, policy);

    expect(asked).toBe(1); // una sola richiesta per l'intera sessione
    expect(audit.entries.filter((e) => e.tool.startsWith('computer.'))).toHaveLength(3);
  });

  it('se l\'utente nega, non esegue e non concede la sessione', async () => {
    let asked = 0;
    const ctx = createToolContext({
      audit: new InMemoryAuditSink(),
      requestApproval: async () => {
        asked += 1;
        return false;
      },
    });
    const registry = new ToolRegistry().registerAll(createComputerTools(fakeExecutor()));
    const out = (await registry.execute('computer.click', { x: 1, y: 1 }, ctx, policy)) as { denied?: boolean };
    expect(out.denied).toBe(true);
    // seconda azione → chiede di nuovo (sessione non concessa)
    await registry.execute('computer.click', { x: 2, y: 2 }, ctx, policy);
    expect(asked).toBe(2);
  });

  it('espone toModelOutput per gli screenshot (content immagine)', () => {
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
    const registry2 = new ToolRegistry().registerAll(createComputerTools(fakeExecutor()));
    const set2 = registry2.toAiToolSet(ctx, policy);
    expect(typeof set2.computer_screenshot?.toModelOutput).toBe('function');
    // biome-ignore lint/suspicious/noExplicitAny: firma AI SDK
    const tmo = set2.computer_screenshot?.toModelOutput as any;
    const mapped = tmo({ output: { screenshot: 'AAAA', width: 100, height: 80 } }) as {
      value: { type: string }[];
    };
    expect(mapped.value.some((p) => p.type === 'file')).toBe(true);
  });
});
