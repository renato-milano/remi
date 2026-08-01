import { type ToolSet, tool } from 'ai';
import type { RiskLevel } from './explain.js';
import type {
  ApprovalRequest,
  AuditEntry,
  AuditSink,
  AutonomyPolicy,
  Tool,
  ToolContext,
} from './types.js';

const RISK_RANK: Record<RiskLevel, number> = { read: 0, network: 1, write: 2, dangerous: 3, unknown: 4 };
const TRUST_MAX: Record<NonNullable<AutonomyPolicy['autoApprove']>, number> = { none: -1, read: 0, write: 2 };

/** true se l'azione può partire senza chiedere, dato il livello di fiducia. */
function autoApproves(trust: AutonomyPolicy['autoApprove'], level: RiskLevel): boolean {
  if (level === 'dangerous' || level === 'unknown') return false; // mai automatico
  return RISK_RANK[level] <= (TRUST_MAX[trust ?? 'none'] ?? -1);
}

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
  emitImage?: (pngBase64: string) => void;
  /** Store dei grant di sessione (namespace). Se passato, i grant persistono
   *  oltre il singolo ciclo (es. computer-use: chiedi una volta per sessione). */
  grants?: Set<string>;
}

export function createToolContext(opts: ToolContextOptions): ToolContext {
  const granted = opts.grants ?? new Set<string>();
  return {
    requestApproval: opts.requestApproval,
    audit: (entry) => opts.audit.write({ ts: entry.ts ?? new Date().toISOString(), ...entry }),
    signal: opts.signal,
    grantSession: (ns) => granted.add(ns),
    isSessionGranted: (ns) => granted.has(ns),
    emitImage: opts.emitImage,
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
      // biome-ignore lint/suspicious/noExplicitAny: config AI SDK costruita dinamicamente
      const cfg: any = {
        description: t.description,
        inputSchema: t.parameters,
        execute: (input: unknown) => executeGated(t, input, ctx, policy),
      };
      if (t.toModelOutput) {
        cfg.toModelOutput = ({ output }: { output: unknown }) => t.toModelOutput?.(output);
      }
      // Alcuni provider (Anthropic) accettano solo [A-Za-z0-9_-] nei nomi tool:
      // sul filo usiamo il nome sanificato, internamente resta col punto (audit/gate).
      set[wireName(t.name)] = tool(cfg);
    }
    return set;
  }
}

/** Nome tool compatibile con tutti i provider (niente punti). */
export function wireName(name: string): string {
  return name.replace(/\./g, '_');
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
  const explanation = t.explain?.(input);
  const isComputer = t.name.startsWith('computer.');
  const isCode = t.name === 'code.run';
  const isShell = t.name === 'shell.run';
  // "non pericoloso" = read/network/write; dangerous/unknown restano sempre gated
  const nonDangerous = !!explanation && explanation.level !== 'dangerous' && explanation.level !== 'unknown';

  let requiresApproval: boolean;
  if (isComputer) {
    // computer-use: approvazione UNA volta per ciclo (gate di sessione), mai auto per rischio
    requiresApproval = !(ctx.isSessionGranted?.('computer') ?? false);
  } else if (isCode) {
    // esecuzione codice: approvazione una volta per sessione, poi scorre
    requiresApproval = !(ctx.isSessionGranted?.('code') ?? false);
  } else {
    requiresApproval = t.permission === 'dangerous' || (t.needsApproval?.(input, policy) ?? false);
    if (requiresApproval && explanation && autoApproves(policy.autoApprove, explanation.level)) {
      requiresApproval = false;
    }
    // shell: dopo la prima approvazione, i comandi NON pericolosi scorrono per la sessione
    if (requiresApproval && isShell && nonDangerous && ctx.isSessionGranted?.('shell')) {
      requiresApproval = false;
    }
  }

  let decision: AuditEntry['decision'] = 'auto';
  if (requiresApproval) {
    const approved = await ctx.requestApproval({
      toolName: t.name,
      summary: isComputer ? 'Controllare il computer' : isCode ? 'Eseguire codice' : `Eseguire ${t.name}`,
      details: input,
      risk: isComputer || isCode || t.permission === 'dangerous' ? 'dangerous' : 'guarded',
      explanation: isComputer
        ? { text: 'controllare lo schermo, il mouse e la tastiera', level: 'dangerous', known: true }
        : isCode
          ? { text: 'scrivere ed eseguire codice sul tuo computer', level: 'dangerous', known: true }
          : explanation,
    });
    if (!approved) {
      ctx.audit({ ts, tool: t.name, input, decision: 'denied', outcome: 'skipped' });
      return { denied: true, reason: 'approvazione negata' };
    }
    if (isComputer) ctx.grantSession?.('computer'); // concedi per il resto del ciclo
    if (isCode) ctx.grantSession?.('code'); // esecuzione codice concessa per la sessione
    // approvato un comando shell non pericoloso → concedi la shell per la sessione
    if (isShell && nonDangerous) ctx.grantSession?.('shell');
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
