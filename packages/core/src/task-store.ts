import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { openTaskDb } from './db.js';

export type TaskStatus = 'pending' | 'in_progress' | 'blocked' | 'done';

export interface Goal {
  id: string;
  title: string;
  status: string;
  createdTs: string;
}

export interface Task {
  id: string;
  goalId?: string;
  title: string;
  status: TaskStatus;
  dueTs?: string;
  createdTs: string;
}

interface TaskRow {
  id: string;
  goal_id: string | null;
  title: string;
  status: string;
  due_ts: string | null;
  created_ts: string;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    goalId: r.goal_id ?? undefined,
    title: r.title,
    status: r.status as TaskStatus,
    dueTs: r.due_ts ?? undefined,
    createdTs: r.created_ts,
  };
}

/** Store persistente di goal e task (SQLite). */
export class TaskStore {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = openTaskDb(dbPath);
  }

  close(): void {
    this.db.close();
  }

  createGoal(input: { title: string }): Goal {
    const goal: Goal = {
      id: randomUUID(),
      title: input.title,
      status: 'active',
      createdTs: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO goals(id,title,status,created_ts) VALUES(?,?,?,?)')
      .run(goal.id, goal.title, goal.status, goal.createdTs);
    return goal;
  }

  createTask(input: { goalId?: string; title: string; dueTs?: string }): Task {
    const task: Task = {
      id: randomUUID(),
      goalId: input.goalId,
      title: input.title,
      status: 'pending',
      dueTs: input.dueTs,
      createdTs: new Date().toISOString(),
    };
    this.db
      .prepare('INSERT INTO tasks(id,goal_id,title,status,due_ts,created_ts) VALUES(?,?,?,?,?,?)')
      .run(task.id, task.goalId ?? null, task.title, task.status, task.dueTs ?? null, task.createdTs);
    return task;
  }

  getTask(id: string): Task | undefined {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id) as TaskRow | undefined;
    return r ? rowToTask(r) : undefined;
  }

  updateTaskStatus(id: string, status: TaskStatus): void {
    this.db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status, id);
  }

  nextPendingTask(): Task | undefined {
    const r = this.db
      .prepare("SELECT * FROM tasks WHERE status='pending' ORDER BY created_ts LIMIT 1")
      .get() as TaskRow | undefined;
    return r ? rowToTask(r) : undefined;
  }

  listTasks(): Task[] {
    const rows = this.db.prepare('SELECT * FROM tasks ORDER BY created_ts').all() as TaskRow[];
    return rows.map(rowToTask);
  }
}
