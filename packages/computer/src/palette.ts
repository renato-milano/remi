/**
 * Colori dominanti di una zona di uno screenshot: servono al modello 3D per copiare i colori
 * dell'oggetto che l'utente ha davanti (una foto, un rendering), invece dei colori "tipici".
 * Lo sfondo (i colori che dominano il bordo della zona) si scarta.
 */

export interface PaletteColor {
  hex: string;
  /** Quota della zona (0-1), sfondo escluso. */
  share: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Lato della griglia di campionamento: ~6400 pixel bastano e restano sotto i 20 ms. */
const SAMPLES = 80;
/** Livelli per canale (5 bit → 32): abbastanza fini per distinguere giallo e arancio. */
const LEVELS = 32;

/** Distanza fra due colori (rgb 0-255), pesata come la percepisce l'occhio. */
function distance(a: number[], b: number[]): number {
  const r = (a[0] + b[0]) / 2;
  const [dr, dg, db] = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  return Math.sqrt((2 + r / 256) * dr * dr + 4 * dg * dg + (2 + (255 - r) / 256) * db * db);
}

const hex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * Colori dominanti di `region` (pixel dell'immagine; omessa = tutta), dal più esteso, al massimo
 * `max`, ciascuno almeno il 3% della zona. Pixel di bitmap RGBA (come quelli di Jimp).
 */
export function dominantColors(
  bitmap: { width: number; height: number; data: Uint8Array | Buffer },
  region?: Region,
  max = 6,
): PaletteColor[] {
  const { width, height, data } = bitmap;
  const x0 = Math.max(0, Math.floor(region?.x ?? 0));
  const y0 = Math.max(0, Math.floor(region?.y ?? 0));
  const x1 = Math.min(width, Math.ceil(region ? region.x + region.w : width));
  const y1 = Math.min(height, Math.ceil(region ? region.y + region.h : height));
  if (x1 - x0 < 4 || y1 - y0 < 4) return [];
  // istogramma su una griglia regolare; il bordo esterno (6%) dice qual è lo sfondo
  const bins = new Map<number, { n: number; edge: number; r: number; g: number; b: number }>();
  let total = 0;
  for (let j = 0; j < SAMPLES; j++) {
    for (let i = 0; i < SAMPLES; i++) {
      const fx = (i + 0.5) / SAMPLES;
      const fy = (j + 0.5) / SAMPLES;
      const px = Math.floor(x0 + fx * (x1 - x0));
      const py = Math.floor(y0 + fy * (y1 - y0));
      const o = (py * width + px) * 4;
      if (data[o + 3] < 128) continue;
      const [r, g, b] = [data[o], data[o + 1], data[o + 2]];
      const key = ((r * LEVELS) >> 8) * LEVELS * LEVELS + ((g * LEVELS) >> 8) * LEVELS + ((b * LEVELS) >> 8);
      const bin = bins.get(key) ?? { n: 0, edge: 0, r: 0, g: 0, b: 0 };
      const edge = fx < 0.06 || fx > 0.94 || fy < 0.06 || fy > 0.94;
      bin.n += 1;
      if (edge) bin.edge += 1;
      bin.r += r;
      bin.g += g;
      bin.b += b;
      bins.set(key, bin);
      total += 1;
    }
  }
  if (!total) return [];
  // grappoli: i livelli vicini (sfumature, ombre leggere) si uniscono al più esteso
  const clusters: { c: number[]; n: number; edge: number }[] = [];
  for (const bin of [...bins.values()].sort((a, b) => b.n - a.n)) {
    const c = [bin.r / bin.n, bin.g / bin.n, bin.b / bin.n];
    const near = clusters.find((k) => distance(k.c, c) < 60);
    if (near) {
      const n = near.n + bin.n;
      near.c = near.c.map((v, k) => (v * near.n + c[k] * bin.n) / n);
      near.n = n;
      near.edge += bin.edge;
    } else clusters.push({ c, n: bin.n, edge: bin.edge });
  }
  const edgeTotal = clusters.reduce((s, k) => s + k.edge, 0) || 1;
  // sfondo: occupa gran parte del bordo e sta più sul bordo che dentro (il bordo è ~22% della
  // griglia: un colore sparso uniforme ha edge/n ≈ 0.22; un oggetto che riempie la zona resta)
  const background = (k: (typeof clusters)[number]) => k.edge / edgeTotal > 0.35 && k.edge / k.n > 0.3;
  const kept = clusters.filter((k) => !background(k));
  const rest = kept.reduce((s, k) => s + k.n, 0);
  if (!rest) return [];
  return kept
    .map((k) => ({ hex: hex(k.c), share: k.n / rest }))
    .filter((k) => k.share >= 0.03)
    .slice(0, max);
}

/** Colori dominanti di una zona di un PNG (base64). */
export async function paletteOf(pngBase64: string, region?: Region, max?: number): Promise<PaletteColor[]> {
  const { Jimp } = await import('jimp');
  const image = await Jimp.read(Buffer.from(pngBase64, 'base64'));
  return dominantColors(image.bitmap, region, max);
}
