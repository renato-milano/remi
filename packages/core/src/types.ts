import type { TokenUsage } from '@openmate/llm';
import type { SceneDetailEvent, SceneStreamEvent } from '@openmate/scene3d';
import type { PanelStreamEvent } from './panel-stream.js';

export type AgentStatus = 'idle' | 'thinking' | 'acting' | 'sleeping' | 'waiting_approval';

export interface AgentState {
  status: AgentStatus;
  activeGoalId?: string;
  activeTaskId?: string;
}

/** Immagine allegata a un messaggio utente (PNG base64), con didascalia per il modello. */
export interface TriggerImage {
  data: string;
  label?: string;
}

export type Trigger =
  | {
      kind: 'user_message';
      content: string;
      images?: TriggerImage[];
      fast?: boolean;
      /** Versione compatta della domanda da tenere nella cronologia (se `content` è un prompt lungo). */
      historyText?: string;
    }
  | { kind: 'heartbeat' }
  | { kind: 'cron'; name: string };

/**
 * Eventi emessi dal loop verso i client (vedi docs/01, docs/08).
 * L'approval_request (con requestId) è emesso dal daemon, non dal loop.
 */
export type AgentEvent =
  | { kind: 'state'; state: AgentState }
  /** Inizio di un turno chiesto dall'utente: la sua domanda (versione compatta se c'è). */
  | { kind: 'turn'; question: string; fast: boolean }
  /** `channel: 'panel'`: il testo è già mostrato (e letto) dal pannello di spiegazione. */
  | { kind: 'message'; role: 'agent'; content: string; channel?: 'panel' }
  | { kind: 'action'; summary: string }
  /** Pannello di spiegazione in streaming (vedi panel-stream.ts). */
  | ({ kind: 'panel' } & PanelStreamEvent)
  /** Modello 3D in streaming (vedi @openmate/scene3d). */
  | ({ kind: 'scene3d' } & (SceneStreamEvent | SceneDetailEvent));

export interface CycleResult {
  taskId?: string;
  actions: number;
  text: string;
  usage: TokenUsage;
}
