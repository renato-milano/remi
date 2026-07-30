import type { TokenUsage } from '@openmate/llm';
import type { ApprovalRequest } from '@openmate/tools';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'sleeping' | 'waiting_approval';

export interface AgentState {
  status: AgentStatus;
  activeGoalId?: string;
  activeTaskId?: string;
}

export type Trigger =
  | { kind: 'user_message'; content: string }
  | { kind: 'heartbeat' }
  | { kind: 'cron'; name: string };

/** Eventi emessi dal loop verso i client (vedi docs/01, docs/08). */
export type AgentEvent =
  | { kind: 'state'; state: AgentState }
  | { kind: 'message'; role: 'agent'; content: string }
  | { kind: 'action'; summary: string }
  | { kind: 'approval_request'; request: ApprovalRequest };

export interface CycleResult {
  taskId?: string;
  actions: number;
  text: string;
  usage: TokenUsage;
}
