import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

export interface Schedule {
  id: string;
  cron: string;
  instruction: string;
  title: string;
  createdAt: string;
  enabled: boolean;
}

/** Persistenza dei task ricorrenti (cron + istruzione) su openmate.db. */
export class ScheduleStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        cron TEXT NOT NULL,
        instruction TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1
      );
    `);
  }

  create(input: { cron: string; instruction: string; title?: string }): Schedule {
    const row: Schedule = {
      id: randomUUID(),
      cron: input.cron,
      instruction: input.instruction,
      title: input.title?.trim() || input.instruction.slice(0, 60),
      createdAt: new Date().toISOString(),
      enabled: true,
    };
    this.db
      .prepare('INSERT INTO schedules(id,cron,instruction,title,created_at,enabled) VALUES(?,?,?,?,?,1)')
      .run(row.id, row.cron, row.instruction, row.title, row.createdAt);
    return row;
  }

  list(): Schedule[] {
    return (this.db.prepare('SELECT * FROM schedules ORDER BY created_at').all() as Record<string, unknown>[]).map(
      map,
    );
  }

  get(id: string): Schedule | undefined {
    const r = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? map(r) : undefined;
  }

  remove(id: string): boolean {
    return this.db.prepare('DELETE FROM schedules WHERE id = ?').run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

function map(r: Record<string, unknown>): Schedule {
  return {
    id: String(r.id),
    cron: String(r.cron),
    instruction: String(r.instruction),
    title: String(r.title),
    createdAt: String(r.created_at),
    enabled: Number(r.enabled) === 1,
  };
}
