import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemory } from '@openmate/memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AutonomyPolicy,
  InMemoryAuditSink,
  ToolRegistry,
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
  it('spiega un comando di lettura', () => {
    const e = explainCommand('ls -la /tmp');
    expect(e.level).toBe('read');
    expect(e.known).toBe(true);
    expect(e.text.toLowerCase()).toContain('elenca');
  });

  it('classifica come pericoloso rm -rf e sudo', () => {
    expect(explainCommand('rm -rf /tmp/x').level).toBe('dangerous');
    expect(explainCommand('sudo rm -rf /').level).toBe('dangerous');
  });

  it('gestisce le pipe e i comandi sconosciuti', () => {
    const pipe = explainCommand('grep -i error app.log | tail -1');
    expect(pipe.level).toBe('read');
    expect(pipe.text).toContain('poi');
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
    expect(Object.keys(set)).toContain('shell.run');
  });
});
