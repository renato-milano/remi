import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

const RUNNERS: Record<string, { cmd: string; ext: string }> = {
  python: { cmd: 'python3', ext: 'py' },
  py: { cmd: 'python3', ext: 'py' },
  node: { cmd: 'node', ext: 'mjs' },
  javascript: { cmd: 'node', ext: 'mjs' },
  js: { cmd: 'node', ext: 'mjs' },
  bash: { cmd: 'bash', ext: 'sh' },
  sh: { cmd: 'bash', ext: 'sh' },
};

function run(
  cmd: string,
  file: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [file], { timeout: timeoutMs, killSignal: 'SIGKILL', signal });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/**
 * Genera ed esegue codice (python/node/bash) in un file temporaneo. Alto rischio
 * (esecuzione arbitraria) → gate di sessione 'code' in executeGated: approvazione
 * una volta per sessione, poi scorre.
 */
export const codeRunTool: Tool = defineTool({
  name: 'code.run',
  description:
    'Scrive ed esegue codice e restituisce output (code, stdout, stderr). Linguaggi: python, node/javascript, bash. Usalo per calcoli, elaborazioni o automazioni non banali.',
  parameters: z.object({
    language: z.enum(['python', 'py', 'node', 'javascript', 'js', 'bash', 'sh']),
    code: z.string().min(1),
    timeoutSeconds: z.number().min(1).max(120).default(30),
  }),
  permission: 'dangerous',
  explain: (i) => ({ text: `eseguire codice ${i.language}`, level: 'dangerous', known: true }),
  execute: async (i, ctx) => {
    const r = RUNNERS[i.language];
    const dir = mkdtempSync(join(tmpdir(), 'openmate-code-'));
    const file = join(dir, `main.${r.ext}`);
    writeFileSync(file, i.code, 'utf8');
    try {
      const out = await run(r.cmd, file, (i.timeoutSeconds ?? 30) * 1000, ctx.signal);
      return {
        code: out.code,
        stdout: out.stdout.slice(0, 20000),
        stderr: out.stderr.slice(0, 8000),
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
});
