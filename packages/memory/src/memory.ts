import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import type Database from 'better-sqlite3';
import matter from 'gray-matter';
import { openDb } from './db.js';
import { type MemoryPaths, notePath, resolvePaths } from './paths.js';
import type {
  CoreBlock,
  EpisodicEvent,
  MemoryHit,
  MemoryRef,
  MemorySystem,
  SearchOptions,
  SemanticNote,
} from './types.js';

const CORE_SEED: Record<CoreBlock, string> = {
  persona: "# Persona\n\n(Definisci qui chi è l'agente: carattere, tono, valori.)",
  user: '# Profilo utente\n\n(Fatti stabili e preferenze durevoli dell\'utente.)',
};

/**
 * Sistema di memoria MVP: core (persona/user), episodic (SQLite), wiki semantica
 * (markdown + gray-matter) e ricerca keyword FTS5. Vettoriale + consolidamento
 * arrivano in Fase 3 (vedi docs/03, docs/11).
 */
export class Memory implements MemorySystem {
  private readonly db: Database.Database;
  private readonly paths: MemoryPaths;

  constructor(root: string) {
    this.paths = resolvePaths(root);
    mkdirSync(this.paths.notesDir, { recursive: true });
    this.db = openDb(this.paths.dbFile);
    this.ensureCoreFiles();
    this.reconcile();
  }

  close(): void {
    this.db.close();
  }

  // --- core memory (sempre iniettata, mai indicizzata) ---
  coreBlocks(): Record<CoreBlock, string> {
    return { persona: this.readCore('persona'), user: this.readCore('user') };
  }

  editCore(block: CoreBlock, content: string): void {
    writeFileSync(this.corePath(block), `${content.trim()}\n`, 'utf8');
  }

  private readCore(block: CoreBlock): string {
    const p = this.corePath(block);
    return existsSync(p) ? readFileSync(p, 'utf8').trim() : '';
  }

  private corePath(block: CoreBlock): string {
    return block === 'persona' ? this.paths.persona : this.paths.userProfile;
  }

  private ensureCoreFiles(): void {
    if (!existsSync(this.paths.persona)) this.editCore('persona', CORE_SEED.persona);
    if (!existsSync(this.paths.userProfile)) this.editCore('user', CORE_SEED.user);
  }

  // --- episodic (append-only) ---
  log(event: EpisodicEvent): number {
    const ts = event.ts ?? new Date().toISOString();
    const info = this.db
      .prepare('INSERT INTO episodic(ts,kind,actor,content) VALUES(?,?,?,?)')
      .run(ts, event.kind, event.actor, event.content);
    const id = Number(info.lastInsertRowid);
    this.db.prepare('INSERT INTO episodic_fts(rowid,content) VALUES(?,?)').run(id, event.content);
    return id;
  }

  // --- semantic wiki (markdown source-of-truth + indice FTS) ---
  writeNote(note: SemanticNote): void {
    const path = notePath(this.paths.notesDir, note.name);
    const file = matter.stringify(`${note.body.trim()}\n`, {
      name: note.name,
      ...(note.description ? { description: note.description } : {}),
      ...(note.type ? { type: note.type } : {}),
    });
    writeFileSync(path, file, 'utf8');
    this.indexNote(note.name, path, file, note.body, note.description, note.type);
    this.regenerateWikiIndex();
  }

  read(ref: MemoryRef): string {
    if (ref.kind === 'episodic') {
      const r = this.db.prepare('SELECT content FROM episodic WHERE id=?').get(ref.id) as
        | { content: string }
        | undefined;
      if (!r) throw new Error(`episodic ${ref.id} non trovato`);
      return r.content;
    }
    const doc = this.db.prepare('SELECT path FROM wiki_docs WHERE note_name=?').get(ref.name) as
      | { path: string }
      | undefined;
    if (!doc) throw new Error(`nota "${ref.name}" non trovata`);
    return matter(readFileSync(doc.path, 'utf8')).content.trim();
  }

  // --- ricerca ibrida keyword (FTS5) ---
  search(query: string, opts?: SearchOptions): MemoryHit[] {
    const k = opts?.k ?? 10;
    const scope = opts?.scope ?? 'all';
    const match = toMatchQuery(query);
    const hits: MemoryHit[] = [];
    if (!match) return hits;

    if (scope === 'all' || scope === 'episodic') {
      const rows = this.db
        .prepare(
          `SELECT rowid AS id, bm25(episodic_fts) AS score,
             snippet(episodic_fts,0,'[',']','…',12) AS snip
           FROM episodic_fts WHERE episodic_fts MATCH ? ORDER BY score LIMIT ?`,
        )
        .all(match, k) as { id: number; score: number; snip: string }[];
      for (const r of rows) {
        hits.push({ ref: { kind: 'episodic', id: r.id }, score: r.score, snippet: r.snip, source: 'episodic' });
      }
    }

    if (scope === 'all' || scope === 'semantic') {
      const rows = this.db
        .prepare(
          `SELECT rowid AS id, bm25(wiki_fts) AS score,
             snippet(wiki_fts,0,'[',']','…',12) AS snip
           FROM wiki_fts WHERE wiki_fts MATCH ? ORDER BY score LIMIT ?`,
        )
        .all(match, k) as { id: number; score: number; snip: string }[];
      for (const r of rows) {
        const doc = this.db.prepare('SELECT note_name FROM wiki_docs WHERE id=?').get(r.id) as
          | { note_name: string }
          | undefined;
        if (doc) {
          hits.push({ ref: { kind: 'semantic', name: doc.note_name }, score: r.score, snippet: r.snip, source: 'semantic' });
        }
      }
    }

    hits.sort((a, b) => a.score - b.score);
    return hits.slice(0, k);
  }

  // --- riconciliazione content-hash (cattura edit manuali dei .md) ---
  reconcile(): void {
    const seen = new Set<string>();
    if (existsSync(this.paths.notesDir)) {
      for (const f of readdirSync(this.paths.notesDir)) {
        if (!f.endsWith('.md')) continue;
        const path = notePath(this.paths.notesDir, basename(f, '.md'));
        const file = readFileSync(path, 'utf8');
        const parsed = matter(file);
        const name = (parsed.data.name as string | undefined) ?? basename(f, '.md');
        seen.add(name);
        const existing = this.db.prepare('SELECT hash FROM wiki_docs WHERE note_name=?').get(name) as
          | { hash: string }
          | undefined;
        if (!existing || existing.hash !== sha256(file)) {
          this.indexNote(
            name,
            path,
            file,
            parsed.content,
            parsed.data.description as string | undefined,
            parsed.data.type as string | undefined,
          );
        }
      }
    }
    // note il cui file non esiste più → rimosse dall'indice
    const docs = this.db.prepare('SELECT id, note_name FROM wiki_docs').all() as {
      id: number;
      note_name: string;
    }[];
    for (const d of docs) {
      if (!seen.has(d.note_name)) {
        this.db.prepare('DELETE FROM wiki_docs WHERE id=?').run(d.id);
        this.db.prepare('DELETE FROM wiki_fts WHERE rowid=?').run(d.id);
      }
    }
    this.regenerateWikiIndex();
  }

  private indexNote(
    name: string,
    path: string,
    fileForHash: string,
    bodyForFts: string,
    description?: string,
    type?: string,
  ): void {
    const hash = sha256(fileForHash);
    const ftsContent = `${name}\n${description ?? ''}\n${bodyForFts}`;
    const existing = this.db.prepare('SELECT id FROM wiki_docs WHERE note_name=?').get(name) as
      | { id: number }
      | undefined;
    if (existing) {
      this.db
        .prepare('UPDATE wiki_docs SET path=?,hash=?,description=?,type=? WHERE id=?')
        .run(path, hash, description ?? null, type ?? null, existing.id);
      this.db.prepare('DELETE FROM wiki_fts WHERE rowid=?').run(existing.id);
      this.db.prepare('INSERT INTO wiki_fts(rowid,content) VALUES(?,?)').run(existing.id, ftsContent);
    } else {
      const info = this.db
        .prepare('INSERT INTO wiki_docs(note_name,path,hash,description,type) VALUES(?,?,?,?,?)')
        .run(name, path, hash, description ?? null, type ?? null);
      const id = Number(info.lastInsertRowid);
      this.db.prepare('INSERT INTO wiki_fts(rowid,content) VALUES(?,?)').run(id, ftsContent);
    }
  }

  private regenerateWikiIndex(): void {
    const docs = this.db
      .prepare('SELECT note_name, description FROM wiki_docs ORDER BY note_name')
      .all() as { note_name: string; description: string | null }[];
    const lines = docs.map(
      (d) => `- [${d.note_name}](notes/${d.note_name}.md)${d.description ? ` — ${d.description}` : ''}`,
    );
    writeFileSync(this.paths.wikiIndex, `# Wiki index\n\n${lines.join('\n')}\n`, 'utf8');
  }
}

export function createMemory(root: string): Memory {
  return new Memory(root);
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** Converte una query utente in un MATCH FTS5 sicuro (prefix + AND implicito). */
function toMatchQuery(q: string): string {
  const tokens = q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens.map((t) => `"${t}"*`).join(' ');
}
