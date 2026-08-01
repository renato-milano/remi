import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemory } from '@openmate/memory';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Executor } from '@openmate/computer';
import {
  type AutonomyPolicy,
  InMemoryAuditSink,
  ToolRegistry,
  codeRunTool,
  createAgentTools,
  createComputerTools,
  createMemoryTools,
  createProjectTools,
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

  it('gate di sessione shell: approvi una volta, poi i non pericolosi scorrono', async () => {
    let asked = 0;
    const grants = new Set<string>();
    const ctx = createToolContext({
      audit,
      grants,
      requestApproval: async () => {
        asked += 1;
        return true;
      },
    });
    // 1ª (non allowlisted, non pericolosa) → chiede e concede la sessione shell
    await registry.execute('shell.run', { command: 'ls /tmp' }, ctx, policy);
    // 2ª e 3ª non pericolose → auto (nessuna nuova richiesta)
    await registry.execute('shell.run', { command: 'cat /etc/hosts' }, ctx, policy);
    await registry.execute('shell.run', { command: 'printf ciao' }, ctx, policy);
    expect(asked).toBe(1);
    // un comando PERICOLOSO chiede comunque, nonostante la sessione concessa
    await registry.execute('shell.run', { command: 'rm -rf /tmp/openmate-nope' }, ctx, policy);
    expect(asked).toBe(2);
  });
});

describe('@openmate/tools — memoria di progetto (.remi)', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openmate-proj-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('crea .remi/project.md alla prima volta e lo rilegge poi', async () => {
    const registry = new ToolRegistry().registerAll(createProjectTools());
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });

    const first = (await registry.execute('project.remember', { path: root }, ctx, policy)) as {
      created: boolean;
      path: string;
      content: string;
    };
    expect(first.created).toBe(true);
    expect(existsSync(join(root, '.remi', 'project.md'))).toBe(true);
    expect(first.content).toContain('Progetto:');

    const second = (await registry.execute('project.remember', { path: root }, ctx, policy)) as {
      created: boolean;
    };
    expect(second.created).toBe(false);

    await registry.execute('project.record', { path: root, note: 'cartella di test' }, ctx, policy);
    expect(readFileSync(join(root, '.remi', 'project.md'), 'utf8')).toContain('cartella di test');
  });

  it('project.update compila una sezione senza toccare le altre', async () => {
    const registry = new ToolRegistry().registerAll(createProjectTools());
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
    await registry.execute('project.remember', { path: root }, ctx, policy);
    await registry.execute(
      'project.update',
      { path: root, section: "Cos'è", content: 'Repo di prova per i test.' },
      ctx,
      policy,
    );
    const md = readFileSync(join(root, '.remi', 'project.md'), 'utf8');
    expect(md).toContain('Repo di prova per i test.');
    expect(md).not.toContain('(da compilare'); // il placeholder di "Cos'è" è stato sostituito
    expect(md).toContain('## A cosa serve'); // le altre sezioni restano
  });

  it('project.write riscrive per intero il file', async () => {
    const registry = new ToolRegistry().registerAll(createProjectTools());
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
    await registry.execute('project.write', { path: root, content: '# Nuovo\n\nsolo questo' }, ctx, policy);
    expect(readFileSync(join(root, '.remi', 'project.md'), 'utf8')).toBe('# Nuovo\n\nsolo questo\n');
  });
});

describe('@openmate/tools — code.run + agent.*', () => {
  it('esegue codice SENZA permesso con fiducia read/write', async () => {
    let asked = 0;
    const readPolicy: AutonomyPolicy = { shell: { allow: [], deny: [] }, files: { allow: [] }, autoApprove: 'read' };
    const ctx = createToolContext({
      audit: new InMemoryAuditSink(),
      requestApproval: async () => {
        asked += 1;
        return true;
      },
    });
    const registry = new ToolRegistry().register(codeRunTool);
    const out1 = (await registry.execute(
      'code.run',
      { language: 'bash', code: 'echo ciao-dal-codice' },
      ctx,
      readPolicy,
    )) as { code: number; stdout: string };
    expect(out1.code).toBe(0);
    expect(out1.stdout).toContain('ciao-dal-codice');
    expect(asked).toBe(0); // nessuna richiesta
  });

  it('con fiducia "chiedimi sempre" chiede una volta, poi scorre', async () => {
    let asked = 0;
    const strictPolicy: AutonomyPolicy = { shell: { allow: [], deny: [] }, files: { allow: [] }, autoApprove: 'none' };
    const ctx = createToolContext({
      audit: new InMemoryAuditSink(),
      grants: new Set<string>(),
      requestApproval: async () => {
        asked += 1;
        return true;
      },
    });
    const registry = new ToolRegistry().register(codeRunTool);
    await registry.execute('code.run', { language: 'bash', code: 'echo a' }, ctx, strictPolicy);
    await registry.execute('code.run', { language: 'bash', code: 'echo b' }, ctx, strictPolicy);
    expect(asked).toBe(1);
  });

  it('agent.set_heartbeat e agent.wake_in chiamano il controllo', async () => {
    let hb = 0;
    let wake: { s: number; note: string } | undefined;
    const registry = new ToolRegistry().registerAll(
      createAgentTools({
        setHeartbeat: (s) => {
          hb = s;
        },
        getHeartbeatSeconds: () => 900,
        wakeIn: (s, note) => {
          wake = { s, note };
        },
      }),
    );
    const ctx = createToolContext({ audit: new InMemoryAuditSink(), requestApproval: async () => true });
    await registry.execute('agent.set_heartbeat', { seconds: 30 }, ctx, policy);
    await registry.execute('agent.wake_in', { seconds: 20, note: 'continua il download' }, ctx, policy);
    expect(hb).toBe(30);
    expect(wake).toEqual({ s: 20, note: 'continua il download' });
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
    describeUi: async () => [],
    clickElement: async () => {},
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
    describeUi: async () => [],
    clickElement: async () => {},
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

  it('emette lo screenshot via ctx.emitImage (non nel tool result)', async () => {
    const images: string[] = [];
    const ctx = createToolContext({
      audit: new InMemoryAuditSink(),
      requestApproval: async () => true,
      emitImage: (b64) => images.push(b64),
    });
    const registry = new ToolRegistry().registerAll(createComputerTools(fakeExecutor()));
    const out = (await registry.execute('computer.screenshot', {}, ctx, policy)) as {
      screenshot?: string;
      width?: number;
    };
    // l'immagine viaggia via emitImage (user message), non dentro il risultato
    expect(images).toEqual(['AAAA']);
    expect(out.screenshot).toBeUndefined();
    expect(out.width).toBe(100);
  });
});
