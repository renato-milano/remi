import { type ToolSet, tool } from 'ai';
import type {
  ApprovalRequest,
  AuditEntry,
  AuditSink,
  AutonomyPolicy,
  Tool,
  ToolContext,
} from './types.js';

/** Sink di audit in-memory (default per test; il daemon userà SQLite in M6). */
export class InMemoryAuditSink implements AuditSink {
  readonly entries: AuditEntry[] = [];
  write(entry: AuditEntry): void {
    this.entries.push(entry);
  }
}

export interface ToolContextOptions {
  audit: AuditSink;
  requestApproval: (req: ApprovalRequest) => Promise<boolean>;
  signal?: AbortSignal;
}

export function createToolContext(opts: ToolContextOptions): ToolContext {
  return {
    requestApproval: opts.requestApproval,
    audit: (entry) => opts.audit.write({ ts: entry.ts ?? new Date().toISOString(), ...entry }),
    signal: opts.signal,
  };
}

/** Registry dei tool + adattatore verso l'AI SDK. */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(t: Tool): this {
    this.tools.set(t.name, t);
    return this;
  }

  registerAll(ts: Tool[]): this {
    for (const t of ts) this.register(t);
    return this;
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** Esegue un tool applicando gate (permessi/approval) e audit. */
  execute(name: string, input: unknown, ctx: ToolContext, policy: AutonomyPolicy): Promise<unknown> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`tool "${name}" non registrato`);
    return executeGated(t, input, ctx, policy);
  }

  /** Converte i tool in un ToolSet AI SDK, con gate/audit nell'execute. */
  toAiToolSet(ctx: ToolContext, policy: AutonomyPolicy): ToolSet {
    const set: ToolSet = {};
    for (const t of this.list()) {
      set[t.name] = tool({
        description: t.description,
        inputSchema: t.parameters,
        execute: (input: unknown) => executeGated(t, input, ctx, policy),
      });
    }
    return set;
  }
}

/** Applica validazione, gate dei permessi (approval) e audit attorno a un tool. */
export async function executeGated(
  t: Tool,
  rawInput: unknown,
  ctx: ToolContext,
  policy: AutonomyPolicy,
): Promise<unknown> {
  const input = t.parameters.parse(rawInput);
  const ts = new Date().toISOString();
  const requiresApproval = t.permission === 'dangerous' || (t.needsApproval?.(input, policy) ?? false);

  let decision: AuditEntry['decision'] = 'auto';
  if (requiresApproval) {
    const approved = await ctx.requestApproval({
      toolName: t.name,
      summary: `Eseguire ${t.name}`,
      details: input,
      risk: t.permission === 'dangerous' ? 'dangerous' : 'guarded',
      explanation: t.explain?.(input),
    });
    if (!approved) {
      ctx.audit({ ts, tool: t.name, input, decision: 'denied', outcome: 'skipped' });
      return { denied: true, reason: 'approvazione negata' };
    }
    decision = 'approved';
  }

  try {
    const output = await t.execute(input, ctx);
    ctx.audit({ ts, tool: t.name, input, decision, outcome: 'ok' });
    return output;
  } catch (err) {
    ctx.audit({ ts, tool: t.name, input, decision, outcome: `error: ${errorMessage(err)}` });
    throw err;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
