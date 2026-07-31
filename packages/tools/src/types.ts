import type { ZodType } from 'zod';
import type { CommandExplanation } from './explain.js';

export type Permission = 'safe' | 'guarded' | 'dangerous';

/** Policy di autonomia (strutturalmente compatibile con config.autonomy). */
export interface AutonomyPolicy {
  shell: { allow: string[]; deny: string[] };
  files: { allow: string[] };
  /** Fino a che rischio agire senza chiedere: none | read | write. Il "dangerous" chiede sempre. */
  autoApprove?: 'none' | 'read' | 'write';
}

export interface ApprovalRequest {
  toolName: string;
  summary: string;
  details: unknown;
  risk: 'guarded' | 'dangerous';
  /** Spiegazione in linguaggio semplice per l'utente (se il tool la fornisce). */
  explanation?: CommandExplanation;
}

export type AuditDecision = 'auto' | 'approved' | 'denied';

export interface AuditEntry {
  ts?: string;
  tool: string;
  input: unknown;
  decision: AuditDecision;
  outcome?: string;
}

export interface AuditSink {
  write(entry: AuditEntry): void;
}

/** Contesto passato ai tool (vedi docs/04, docs/06). */
export interface ToolContext {
  requestApproval(req: ApprovalRequest): Promise<boolean>;
  audit(entry: AuditEntry): void;
  signal?: AbortSignal;
  /** Concede l'approvazione a un namespace per il resto del ciclo (es. 'computer'). */
  grantSession?(namespace: string): void;
  isSessionGranted?(namespace: string): boolean;
  /**
   * Rende un'immagine (PNG base64) visibile al modello. Viene iniettata come
   * user message: i tool result non trasportano immagini su molti provider
   * (OpenAI-compatible), gli user message sì. Usato dal computer-use.
   */
  emitImage?(pngBase64: string): void;
}

/**
 * Un tool: l'unico modo in cui l'agente tocca il mondo. `needsApproval` permette
 * una gate per-parametro (es. shell.run per comando) oltre al livello statico.
 */
export interface Tool<I = unknown, O = unknown> {
  name: string;
  description: string;
  parameters: ZodType<I>;
  permission: Permission;
  needsApproval?(input: I, policy: AutonomyPolicy): boolean;
  /** Spiegazione in linguaggio semplice dell'azione, per la card di approvazione. */
  explain?(input: I): CommandExplanation;
  /** Mappa l'output a content-parts per il modello (es. immagine per gli screenshot). */
  toModelOutput?(output: O): unknown;
  execute(input: I, ctx: ToolContext): Promise<O>;
}

export function defineTool<I, O>(tool: Tool<I, O>): Tool<I, O> {
  return tool;
}
