import Database from 'better-sqlite3';

/**
 * Tabelle goal/task sullo stesso openmate.db (migrazioni additive, IF NOT EXISTS —
 * coesistono con quelle di @openmate/memory). Vedi docs/11.
 */
export function openTaskDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      created_ts TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      goal_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      due_ts TEXT,
      created_ts TEXT NOT NULL
    );
  `);
  return db;
}
