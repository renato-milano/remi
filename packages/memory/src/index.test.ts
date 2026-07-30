import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Memory, createMemory } from './index.js';

let root: string;
let mem: Memory;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openmate-mem-'));
  mem = createMemory(root);
});

afterEach(() => {
  mem.close();
  rmSync(root, { recursive: true, force: true });
});

describe('@openmate/memory', () => {
  it('scrive una nota e la ritrova con search', () => {
    mem.writeNote({
      name: 'progetto-x',
      description: 'Il progetto X',
      body: 'Riguarda la migrazione del database legacy.',
    });
    const hits = mem.search('database legacy', { scope: 'semantic' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.ref).toEqual({ kind: 'semantic', name: 'progetto-x' });
    expect(mem.read({ kind: 'semantic', name: 'progetto-x' })).toContain('migrazione');
  });

  it('registra un episodic e lo ritrova', () => {
    const id = mem.log({ kind: 'action', actor: 'agent', content: 'Eseguito backup notturno del server' });
    const hits = mem.search('backup server', { scope: 'episodic' });
    expect(hits.some((h) => h.ref.kind === 'episodic' && h.ref.id === id)).toBe(true);
  });

  it('gestisce la core memory', () => {
    mem.editCore('persona', 'Sono un compagno curioso e conciso.');
    expect(mem.coreBlocks().persona).toContain('curioso');
  });

  it('persiste i dati tra riavvii', () => {
    mem.writeNote({ name: 'nota-persistente', body: 'contenuto durevole unico xyzzy' });
    mem.log({ kind: 'event', actor: 'user', content: 'evento durevole plugh' });
    mem.close();
    mem = createMemory(root); // riapertura sullo stesso rootDir
    expect(mem.search('xyzzy', { scope: 'semantic' }).length).toBeGreaterThan(0);
    expect(mem.search('plugh', { scope: 'episodic' }).length).toBeGreaterThan(0);
  });

  it('riconcilia le note editate a mano allo startup', () => {
    const p = join(root, 'memory', 'notes', 'esterna.md');
    writeFileSync(p, '---\nname: esterna\ndescription: creata a mano\n---\n\nParola magica frobozz.\n', 'utf8');
    mem.close();
    mem = createMemory(root); // reconcile() in costruttore indicizza il file esterno
    const hits = mem.search('frobozz', { scope: 'semantic' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.ref).toEqual({ kind: 'semantic', name: 'esterna' });
  });
});
