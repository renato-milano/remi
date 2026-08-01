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

/** Sostituisce il contenuto di una sezione "## <nome>"; se manca, la aggiunge in fondo. */
function setSection(md: string, section: string, content: string): string {
  const lines = md.split('\n');
  const norm = (s: string) => s.trim().toLowerCase();
  const head = lines.findIndex((l) => l.startsWith('## ') && norm(l.slice(3)) === norm(section));
  if (head === -1) return `${md.trimEnd()}\n\n## ${section}\n${content.trim()}\n`;
  let end = lines.length;
  for (let i = head + 1; i < lines.length; i++) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return [...lines.slice(0, head + 1), content.trim(), '', ...lines.slice(end)].join('\n');
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
      "Aggiunge una riga al 'Registro azioni' della memoria di progetto: un evento o un'azione fatta, con timestamp. Per la descrizione stabile della cartella usa invece project.update.",
    parameters: z.object({
      path: z.string().default('.'),
      note: z.string().describe('evento/azione da registrare (una riga)'),
    }),
    permission: 'safe',
    explain: () => ({ text: 'registrare un evento nella memoria di progetto', level: 'read', known: true }),
    execute: async (i) => {
      const { file } = ensure(i.path);
      const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
      appendFileSync(file, `- [${ts}] ${i.note}\n`, 'utf8');
      return { ok: true, path: file };
    },
  });

  const update = defineTool({
    name: 'project.update',
    description:
      "Compila/riscrive una sezione stabile della memoria di progetto (es. \"Cos'è\", \"A cosa serve\", \"Contesto e note\"). Usalo alla prima visita di una cartella per descrivere cos'è e a cosa serve, e per tenerla aggiornata.",
    parameters: z.object({
      path: z.string().default('.'),
      section: z.string().describe('nome della sezione, es. "Cos\'è" o "A cosa serve"'),
      content: z.string().describe('nuovo contenuto della sezione'),
    }),
    permission: 'safe',
    explain: (i) => ({ text: `aggiornare la sezione "${i.section}" del progetto`, level: 'read', known: true }),
    execute: async (i) => {
      const { file } = ensure(i.path);
      const next = setSection(readFileSync(file, 'utf8'), i.section, i.content);
      writeFileSync(file, next, 'utf8');
      return { ok: true, path: file };
    },
  });

  const write = defineTool({
    name: 'project.write',
    description:
      "Riscrive per intero la memoria di progetto (.remi/project.md) con il testo dato. Usalo quando vuoi riorganizzarla liberamente; per modifiche puntuali preferisci project.update o project.record.",
    parameters: z.object({
      path: z.string().default('.'),
      content: z.string().describe('contenuto markdown completo del file'),
    }),
    permission: 'safe',
    explain: () => ({ text: 'riscrivere la memoria di progetto', level: 'read', known: true }),
    execute: async (i) => {
      const { dir, file } = paths(i.path);
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, i.content.endsWith('\n') ? i.content : `${i.content}\n`, 'utf8');
      return { ok: true, path: file };
    },
  });

  return [remember, record, update, write];
}
