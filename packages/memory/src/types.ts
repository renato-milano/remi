export type Actor = 'agent' | 'user' | 'system';
export type EpisodicKind = 'event' | 'action' | 'observation' | 'reflection';

export interface EpisodicEvent {
  /** ISO 8601; default: adesso. */
  ts?: string;
  kind: EpisodicKind;
  actor: Actor;
  content: string;
}

export interface SemanticNote {
  /** Slug univoco della nota (nome file senza estensione). */
  name: string;
  description?: string;
  type?: string;
  /** Corpo markdown, senza frontmatter. */
  body: string;
}

export type CoreBlock = 'persona' | 'user';

export type MemoryRef =
  | { kind: 'episodic'; id: number }
  | { kind: 'semantic'; name: string };

export type MemorySource = 'episodic' | 'semantic';

export interface MemoryHit {
  ref: MemoryRef;
  /** Punteggio BM25: più basso = più rilevante. */
  score: number;
  snippet: string;
  source: MemorySource;
}

export interface SearchOptions {
  k?: number;
  scope?: 'episodic' | 'semantic' | 'all';
}

/** Contratto MVP-normativo del sistema di memoria (vedi docs/03, docs/11). */
export interface MemorySystem {
  coreBlocks(): Record<CoreBlock, string>;
  editCore(block: CoreBlock, content: string): void;
  log(event: EpisodicEvent): number;
  writeNote(note: SemanticNote): void;
  read(ref: MemoryRef): string;
  search(query: string, opts?: SearchOptions): MemoryHit[];
  reconcile(): void;
  close(): void;
}
