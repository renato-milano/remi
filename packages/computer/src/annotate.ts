/** Raggio esterno del marcatore, in pixel dell'immagine. */
const RING_RADIUS = 14;
const RING_WIDTH = 4;

/**
 * Disegna un anello rosso (con bordo bianco per il contrasto) nel punto (x,y)
 * di un PNG. Serve a mostrare al modello DOVE l'utente sta puntando: il cursore
 * reale non compare negli screenshot di sistema.
 */
export async function markPoint(pngBase64: string, x: number, y: number): Promise<string> {
  const { Jimp } = await import('jimp');
  const image = await Jimp.read(Buffer.from(pngBase64, 'base64'));
  const { width, height } = image.bitmap;
  const outer = RING_RADIUS + 2;
  for (let dy = -outer; dy <= outer; dy++) {
    for (let dx = -outer; dx <= outer; dx++) {
      const px = Math.round(x) + dx;
      const py = Math.round(y) + dy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= RING_RADIUS - RING_WIDTH && d <= RING_RADIUS) image.setPixelColor(0xff2d2dff, px, py);
      else if (d > RING_RADIUS && d <= outer) image.setPixelColor(0xffffffff, px, py);
      else if (d < RING_RADIUS - RING_WIDTH && d >= RING_RADIUS - RING_WIDTH - 2)
        image.setPixelColor(0xffffffff, px, py);
      else if (d <= 2) image.setPixelColor(0xff2d2dff, px, py);
    }
  }
  const out = await image.getBuffer('image/png');
  return out.toString('base64');
}

/**
 * Disegna il tracciato chiuso (x,y) di un PNG con una linea rossa spessa:
 * mostra al modello l'area che l'utente ha circoscritto col mouse.
 */
export async function markPath(pngBase64: string, points: { x: number; y: number }[]): Promise<string> {
  const { Jimp } = await import('jimp');
  const image = await Jimp.read(Buffer.from(pngBase64, 'base64'));
  const { width, height } = image.bitmap;
  const stamp = (cx: number, cy: number, r: number, color: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = Math.round(cx) + dx;
        const py = Math.round(cy) + dy;
        if (dx * dx + dy * dy > r * r || px < 0 || py < 0 || px >= width || py >= height) continue;
        image.setPixelColor(color, px, py);
      }
    }
  };
  const closed = points.length > 2 ? [...points, points[0]] : points;
  // prima il bordo bianco (contrasto), poi il tratto rosso sopra
  for (const [r, color] of [
    [4, 0xffffffff],
    [2, 0xff2d2dff],
  ] as const) {
    for (let i = 1; i < closed.length; i++) {
      const a = closed[i - 1];
      const b = closed[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s++) stamp(a.x + ((b.x - a.x) * s) / steps, a.y + ((b.y - a.y) * s) / steps, r, color);
    }
  }
  const out = await image.getBuffer('image/png');
  return out.toString('base64');
}
