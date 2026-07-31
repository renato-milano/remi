export type MouseButton = 'left' | 'right' | 'middle';

export interface Screenshot {
  /** PNG in base64 (eventualmente ridotto per grounding/token). */
  pngBase64: string;
  /** Dimensioni dell'immagine effettivamente inviata al modello. */
  width: number;
  height: number;
}

export interface Capabilities {
  supported: boolean;
  /** Motivo se non supportato (es. Wayland). */
  reason?: string;
  platform: NodeJS.Platform;
}

/**
 * Executor cross-platform: le coordinate ricevute (x,y) sono nello spazio pixel
 * dell'ultimo screenshot; l'executor le mappa alle coordinate del sistema di
 * puntamento (nut.js) internamente.
 */
export interface Executor {
  capabilities(): Capabilities;
  screenshot(): Promise<Screenshot>;
  move(x: number, y: number): Promise<void>;
  click(x: number, y: number, button?: MouseButton): Promise<void>;
  doubleClick(x: number, y: number, button?: MouseButton): Promise<void>;
  type(text: string): Promise<void>;
  /** Combinazione di tasti, es. ["cmd","space"]. */
  key(keys: string[]): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;
}
