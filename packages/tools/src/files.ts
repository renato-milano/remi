import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { z } from 'zod';
import { type AutonomyPolicy, type Tool, defineTool } from './types.js';

function isWithin(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  return c === p || c.startsWith(p + sep);
}

/** Percorso fuori dai path consentiti → richiede approvazione. */
export function fileNeedsApproval(path: string, policy: AutonomyPolicy): boolean {
  const { allow } = policy.files;
  if (allow.length === 0) return true;
  return !allow.some((dir) => isWithin(path, dir));
}

export const fileReadTool: Tool<{ path: string }, { content: string }> = defineTool({
  name: 'file.read',
  description: 'Legge il contenuto UTF-8 di un file.',
  parameters: z.object({ path: z.string() }),
  permission: 'guarded',
  needsApproval: (input, policy) => fileNeedsApproval(input.path, policy),
  execute: async (input) => ({ content: readFileSync(input.path, 'utf8') }),
});

export const fileWriteTool: Tool<{ path: string; content: string }, { bytes: number }> = defineTool({
  name: 'file.write',
  description: 'Scrive contenuto UTF-8 in un file (sovrascrive).',
  parameters: z.object({ path: z.string(), content: z.string() }),
  permission: 'guarded',
  needsApproval: (input, policy) => fileNeedsApproval(input.path, policy),
  execute: async (input) => {
    writeFileSync(input.path, input.content, 'utf8');
    return { bytes: Buffer.byteLength(input.content, 'utf8') };
  },
});

export const fileListTool: Tool<{ path: string }, { entries: string[] }> = defineTool({
  name: 'file.list',
  description: 'Elenca il contenuto di una directory.',
  parameters: z.object({ path: z.string() }),
  permission: 'guarded',
  needsApproval: (input, policy) => fileNeedsApproval(input.path, policy),
  execute: async (input) => ({ entries: readdirSync(input.path) }),
});

export const fileTools: Tool[] = [fileReadTool, fileWriteTool, fileListTool];
