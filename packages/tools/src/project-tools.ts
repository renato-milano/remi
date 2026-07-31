import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { z } from 'zod';
import { type Tool, defineTool } from './types.js';

/** Memoria di progetto per cartella: <cartella>/.remi/project.md */
const DIR = '.remi';
const FILE = 'project.md';

function paths(path = '.') {
  const root = resolve(path || '.');
  return { root, dir: join(root, DIR), file: join(root, DIR, FILE) };
}

function template(root: string): string {
  const now = new Date().toISOString().slice(0, 10);
  return `# Progetto: ${basename(root) || root}

_Cartella: ${root}_
_Creato: ${now}_

## Cos'è
(da compilare: cos'è questa cartella)

## A cosa serve
(scopo, cosa ci si fa)

## Contesto e note
(struttura, file importanti, come si lavora qui)

## Registro azioni
`;
}

function ensure(path = '.'): { root: string; file: string; created: boolean } {
  const { root, dir, file } = paths(path);
  let created = false;
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, template(root), 'utf8');
    created = true;
  }
  return { root, file, created };
}

/**
 * Tool di memoria-di-progetto (stile "cowork"): ogni cartella può avere una
 * memoria persistente in .remi/project.md che ricorda cos'è e a cosa serve.
 */
export function createProjectTools(): Tool[] {
  const remember = defineTool({
    name: 'project.remember',
    description:
      "Apre la memoria di progetto di una cartella (.remi/project.md): la crea se manca e restituisce il contenuto, così ricordi cos'è la cartella e a cosa serve. Chiamalo quando inizi a lavorare in una cartella.",
    parameters: z.object({ path: z.string().default('.') }),
    permission: 'safe',
    explain: (i) => ({
      text: `ricordare il progetto in ${basename(resolve(i.path || '.'))}`,
      level: 'read',
      known: true,
    }),
    execute: async (i) => {
      const { root, file, created } = ensure(i.path);
      return { created, root, path: file, content: readFileSync(file, 'utf8') };
    },
  });

  const record = defineTool({
    name: 'project.record',
    description:
      "Aggiorna la memoria di progetto (.remi/project.md) con qualcosa di importante su questa cartella: scopo, contesto o un'azione fatta. Serve a ricordare in futuro.",
    parameters: z.object({
      path: z.string().default('.'),
      note: z.string().describe('cosa ricordare (una riga)'),
    }),
    permission: 'safe',
    explain: () => ({ text: 'aggiornare la memoria di progetto', level: 'read', known: true }),
    execute: async (i) => {
      const { file } = ensure(i.path);
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
      appendFileSync(file, `- [${ts}] ${i.note}\n`, 'utf8');
      return { ok: true, path: file };
    },
  });

  return [remember, record];
}
