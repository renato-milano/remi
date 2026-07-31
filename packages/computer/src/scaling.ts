/**
 * Mappa una coordinata dallo spazio pixel dell'immagine inviata al modello
 * verso lo spazio del sistema di puntamento (nut.js).
 *
 * Invariante: nut.js usa lo stesso sistema di coordinate per screen.width()
 * e mouse.setPosition(); quindi il rapporto è (dimensione schermo nut) /
 * (dimensione immagine inviata) — gestisce insieme downscale e HiDPI/retina.
 */
export interface ShotMapping {
  /** Larghezza/altezza dell'immagine inviata al modello (pixel). */
  sentW: number;
  sentH: number;
  /** Larghezza/altezza dello schermo nelle unità di nut.js. */
  nutW: number;
  nutH: number;
}

export function toLogical(x: number, y: number, m: ShotMapping): { x: number; y: number } {
  const sx = m.sentW > 0 ? m.nutW / m.sentW : 1;
  const sy = m.sentH > 0 ? m.nutH / m.sentH : 1;
  return { x: Math.round(x * sx), y: Math.round(y * sy) };
}
