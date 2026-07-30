import type { MemorySystem } from '@openmate/memory';
import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

const refSchema = z.union([
  z.object({ kind: z.literal('episodic'), id: z.number().int() }),
  z.object({ kind: z.literal('semantic'), name: z.string() }),
]);

/** Tool `memory.*`: recall agentico + gestione della memoria (docs/03, ADR-0005). */
export function createMemoryTools(memory: MemorySystem): Tool[] {
  const search = defineTool({
    name: 'memory.search',
    description: 'Cerca nella memoria (episodic + semantic) con ricerca keyword.',
    parameters: z.object({
      query: z.string(),
      k: z.number().int().positive().optional(),
      scope: z.enum(['episodic', 'semantic', 'all']).optional(),
    }),
    permission: 'safe',
    execute: async (input) => ({ hits: memory.search(input.query, { k: input.k, scope: input.scope }) }),
  });

  const read = defineTool({
    name: 'memory.read',
    description: 'Legge il contenuto pieno di un episodic o di una nota semantica.',
    parameters: z.object({ ref: refSchema }),
    permission: 'safe',
    execute: async (input) => ({ content: memory.read(input.ref) }),
  });

  const write = defineTool({
    name: 'memory.write',
    description: 'Crea o aggiorna una nota semantica (wiki markdown).',
    parameters: z.object({
      name: z.string(),
      description: z.string().optional(),
      type: z.string().optional(),
      body: z.string(),
    }),
    permission: 'guarded',
    execute: async (input) => {
      memory.writeNote(input);
      return { ok: true };
    },
  });

  const log = defineTool({
    name: 'memory.log',
    description: 'Registra un evento episodic.',
    parameters: z.object({
      kind: z.enum(['event', 'action', 'observation', 'reflection']),
      actor: z.enum(['agent', 'user', 'system']),
      content: z.string(),
    }),
    permission: 'safe',
    execute: async (input) => ({ id: memory.log(input) }),
  });

  const coreEdit = defineTool({
    name: 'memory.core.edit',
    description: 'Modifica un blocco di core memory (persona o profilo utente).',
    parameters: z.object({ block: z.enum(['persona', 'user']), content: z.string() }),
    permission: 'guarded',
    execute: async (input) => {
      memory.editCore(input.block, input.content);
      return { ok: true };
    },
  });

  return [search, read, write, log, coreEdit];
}
