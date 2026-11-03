export type MouseButton = 'left' | 'right' | 'middle';

export type { UiElement } from './ui-inspect.js';
import type { UiElement } from './ui-inspect.js';

export interface Screenshot {
  /** PNG in base64 (eventualmente ridotto per grounding/token). */
  pngBase64: string;
  /** Dimensioni dell'immagine effettivamente inviata al modello. */
  width: number;
  height: number;
  /** Dimensioni dello schermo catturato nelle coordinate logiche del sistema (punti). */
  logicalW?: number;
  logicalH?: number;
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
  /** Elenca gli elementi UI cliccabili (accessibilità); li memorizza per clickElement. */
  describeUi(): Promise<UiElement[]>;
  /** Clicca l'elemento all'indice dell'ultimo describeUi (coordinate AX esatte). */
  clickElement(index: number): Promise<void>;
}
