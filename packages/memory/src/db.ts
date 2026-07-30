import Database from 'better-sqlite3';

/**
 * Versione dello schema di memoria. Le migrazioni sono additive e idempotente:
 * altri package (core/tools) aggiungeranno le proprie tabelle sullo stesso file
 * openmate.db nelle fasi successive (goals/tasks/audit — vedi docs/11).
 */
const SCHEMA_VERSION = 1;

export function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as
    | { value: string }
    | undefined;
  const current = row ? Number(row.value) : 0;

  if (current < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS episodic (
        id INTEGER PRIMARY KEY,
        ts TEXT NOT NULL,
        kind TEXT NOT NULL,
        actor TEXT NOT NULL,
        content TEXT NOT NULL,
        consolidated INTEGER NOT NULL DEFAULT 0
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS episodic_fts USING fts5(content, tokenize='porter unicode61');

      CREATE TABLE IF NOT EXISTS wiki_docs (
        id INTEGER PRIMARY KEY,
        note_name TEXT UNIQUE NOT NULL,
        path TEXT NOT NULL,
        hash TEXT NOT NULL,
        description TEXT,
        type TEXT
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(content, tokenize='porter unicode61');
    `);
    db.prepare('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)').run(
      'schema_version',
      String(SCHEMA_VERSION),
    );
  }
}
