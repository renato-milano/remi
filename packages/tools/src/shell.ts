import { spawn } from 'node:child_process';
import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

export interface ShellResult {
  code: number;
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function runShell(
  command: string,
  opts: { cwd?: string; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd: opts.cwd,
      signal: opts.signal,
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    });
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

/** Un comando è "sotto controllo": nel deny, o non coperto dall'allow. */
function matchesPattern(command: string, pattern: string): boolean {
  const program = command.trim().split(/\s+/)[0] ?? '';
  if (pattern.endsWith('*')) return command.startsWith(pattern.slice(0, -1));
  return program === pattern || command.startsWith(pattern);
}

export function shellNeedsApproval(
  command: string,
  policy: { shell: { allow: string[]; deny: string[] } },
): boolean {
  const { allow, deny } = policy.shell;
  if (deny.some((p) => matchesPattern(command, p))) return true;
  if (allow.length === 0) return true; // senza allowlist: chiedi sempre
  return !allow.some((p) => matchesPattern(command, p));
}

export const shellRunTool: Tool<{ command: string; cwd?: string }, ShellResult> = defineTool({
  name: 'shell.run',
  description: 'Esegue un comando shell e restituisce code, stdout e stderr.',
  parameters: z.object({ command: z.string(), cwd: z.string().optional() }),
  permission: 'guarded',
  needsApproval: (input, policy) => shellNeedsApproval(input.command, policy),
  execute: (input, ctx) =>
    runShell(input.command, { cwd: input.cwd, timeoutMs: DEFAULT_TIMEOUT_MS, signal: ctx.signal }),
});
