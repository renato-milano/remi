import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AgentEvent, CognitiveLoop, TaskStore } from '@openmate/core';
import type { ReasoningBackend } from '@openmate/llm';
import { createMemory } from '@openmate/memory';
import { Scheduler } from '@openmate/scheduler';
import {
  type AutonomyPolicy,
  InMemoryAuditSink,
  ToolRegistry,
  codeRunTool,
  createAgentTools,
  createMemoryTools,
  createProjectTools,
  createScheduleTools,
  fileTools,
  shellRunTool,
} from '@openmate/tools';

/** Chiamate registrate ai tool "di controllo" (agent/schedule) per gli assert. */
export interface Recorder {
  schedules: { id: string; cron: string; instruction: string; title: string }[];
  heartbeat?: number;
  wake?: { seconds: number; note: string };
}

/** Contesto di un eval al momento del check: audit, output, side-effect, token. */
export interface EvalResult {
  dir: string;
  messages: string[];
  finalText: string;
  toolsUsed: string[];
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  recorder: Recorder;
  /** helper side-effect sul filesystem della cartella di lavoro. */
  fileExists(rel: string): boolean;
  read(rel: string): string;
}

export type Check = { ok: boolean; label: string };

export interface Eval {
  name: string;
  category: string;
  /** Uno o più messaggi utente eseguiti in sequenza (stessa memoria/storage).
   *  Più prompt = conversazione multi-ciclo (es. salva-poi-ricorda). `{dir}` →
   *  cartella di lavoro. */
  prompt: string | string[];
  setup?: (dir: string) => void;
  check: (r: EvalResult) => Check[];
  maxSteps?: number;
}

export interface RanEval {
  name: string;
  category: string;
  checks: Check[];
  pass: boolean;
  tools: string[];
  usage: EvalResult['usage'];
}

function buildRegistry(memory: ReturnType<typeof createMemory>, rec: Recorder): ToolRegistry {
  return new ToolRegistry()
    .register(shellRunTool)
    .register(codeRunTool)
    .registerAll(fileTools)
    .registerAll(createMemoryTools(memory))
    .registerAll(createProjectTools())
    .registerAll(
      createAgentTools({
        setHeartbeat: (s) => {
          rec.heartbeat = s;
        },
        getHeartbeatSeconds: () => 900,
        wakeIn: (seconds, note) => {
          rec.wake = { seconds, note };
        },
      }),
    )
    .registerAll(
      createScheduleTools({
        isValidCron: (e) => Scheduler.isValidCron(e),
        create: (i) => {
          const s = { id: `s${rec.schedules.length}`, cron: i.cron, instruction: i.instruction, title: i.title ?? i.instruction };
          rec.schedules.push(s);
          return s;
        },
        list: () => rec.schedules,
        cancel: () => true,
      }),
    );
}

const POLICY: AutonomyPolicy = { shell: { allow: [], deny: [] }, files: { allow: [] }, autoApprove: 'write' };

export async function runEval(ev: Eval, backend: ReasoningBackend): Promise<RanEval> {
  const dir = mkdtempSync(join(tmpdir(), 'openmate-eval-')); // cartella di lavoro (pulita)
  const storageDir = mkdtempSync(join(tmpdir(), 'openmate-eval-store-')); // storage separato
  try {
    ev.setup?.(dir);
    const memory = createMemory(storageDir);
    const tasks = new TaskStore(join(storageDir, 'openmate.db'));
    const audit = new InMemoryAuditSink();
    const rec: Recorder = { schedules: [] };
    const registry = buildRegistry(memory, rec);
    const messages: string[] = [];

    const loop = new CognitiveLoop({
      backend,
      registry,
      memory,
      tasks,
      policy: POLICY,
      budget: { maxSteps: ev.maxSteps ?? 12, wallClockMs: 180_000 },
      audit,
      requestApproval: async () => true, // eval: auto-approva tutto
      onEvent: (e: AgentEvent) => {
        if (e.kind === 'message') messages.push(e.content);
      },
    });

    const prompts = Array.isArray(ev.prompt) ? ev.prompt : [ev.prompt];
    const usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    for (const p of prompts) {
      const res = await loop.runCycle({ kind: 'user_message', content: p.replaceAll('{dir}', dir) }, {});
      usage.inputTokens += res.usage.inputTokens ?? 0;
      usage.outputTokens += res.usage.outputTokens ?? 0;
      usage.totalTokens += res.usage.totalTokens ?? (res.usage.inputTokens ?? 0) + (res.usage.outputTokens ?? 0);
    }
    memory.close();
    tasks.close();

    const r: EvalResult = {
      dir,
      messages,
      finalText: messages.join('\n'),
      toolsUsed: [...new Set(audit.entries.map((e) => e.tool))],
      usage,
      recorder: rec,
      fileExists: (rel) => existsSync(join(dir, rel)),
      read: (rel) => (existsSync(join(dir, rel)) ? readFileSync(join(dir, rel), 'utf8') : ''),
    };
    const checks = ev.check(r);
    return {
      name: ev.name,
      category: ev.category,
      checks,
      pass: checks.every((c) => c.ok),
      tools: r.toolsUsed,
      usage,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(storageDir, { recursive: true, force: true });
  }
}
