import Database from 'better-sqlite3';
import type { AuditEntry, AuditSink } from '@openmate/tools';

/** Audit log append-only su SQLite (docs/06). Tabella additiva su openmate.db. */
export class SqliteAuditSink implements AuditSink {
  private readonly db: Database.Database;
  private readonly insert: Database.Statement;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY,
        ts TEXT NOT NULL,
        tool TEXT NOT NULL,
        input TEXT NOT NULL,
        decision TEXT NOT NULL,
        outcome TEXT,
        agent_state TEXT
      );
    `);
    this.insert = this.db.prepare(
      'INSERT INTO audit(ts,tool,input,decision,outcome,agent_state) VALUES(?,?,?,?,?,?)',
    );
  }

  write(entry: AuditEntry): void {
    this.insert.run(
      entry.ts ?? new Date().toISOString(),
      entry.tool,
      JSON.stringify(entry.input),
      entry.decision,
      entry.outcome ?? null,
      null,
    );
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM audit').get() as { n: number }).n;
  }

  /** Ultime N voci (per la dashboard), più recenti prima. */
  recent(n = 50): AuditEntry[] {
    const rows = this.db
      .prepare('SELECT ts,tool,input,decision,outcome FROM audit ORDER BY id DESC LIMIT ?')
      .all(n) as Record<string, unknown>[];
    return rows.map((r) => ({
      ts: String(r.ts),
      tool: String(r.tool),
      input: r.input,
      decision: String(r.decision) as AuditEntry['decision'],
      outcome: r.outcome == null ? undefined : String(r.outcome),
    }));
  }

  close(): void {
    this.db.close();
  }
}
