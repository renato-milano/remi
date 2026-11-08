import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectCapabilities } from './capabilities.js';
import { type ShotMapping, toLogical } from './scaling.js';
import type { Capabilities, Executor, MouseButton, Screenshot } from './types.js';
import { type UiElement, inspectUi } from './ui-inspect.js';

/** Larghezza massima dell'immagine inviata al modello (grounding + token). */
const MAX_WIDTH = 1366;

/** Pausa fra un tasto e l'altro: il default di nut.js (300 ms) rende lenta ogni frase scritta. */
const KEY_DELAY_MS = 8;

type Nut = typeof import('@nut-tree-fork/nut-js');
let nutPromise: Promise<Nut> | undefined;
function loadNut(): Promise<Nut> {
  // import lazy: carica il modulo nativo solo quando serve davvero
  nutPromise ??= import('@nut-tree-fork/nut-js').then((nut) => {
    nut.keyboard.config.autoDelayMs = KEY_DELAY_MS;
    return nut;
  });
  return nutPromise;
}

/**
 * Chiede all'app di togliere di mezzo le proprie finestre sopra lo schermo (modello 3D,
 * lavagna cliccabile) prima di un'azione o di uno screenshot: coprirebbero la pagina e
 * si prenderebbero i clic. Senza l'app (OPENMATE_SHOT_URL assente) non fa nulla.
 */
async function clearOverlays(): Promise<void> {
  const shotUrl = process.env.OPENMATE_SHOT_URL;
  if (!shotUrl) return;
  try {
    await fetch(shotUrl.replace(/\/shot$/, '/overlays-off'), { signal: AbortSignal.timeout(500) });
  } catch {
    /* app non raggiungibile: si prosegue comunque */
  }
}

/** Larghezza e altezza di un PNG lette dall'intestazione (IHDR), senza decodificarlo. */
function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Risolve un nome di tasto ("cmd", "enter"…) nel valore Key di nut.js. */
function resolveKey(K: Record<string, number>, name: string): number | undefined {
  const table: Record<string, string[]> = {
    cmd: ['LeftSuper', 'LeftCmd', 'LeftWin'],
    command: ['LeftSuper', 'LeftCmd', 'LeftWin'],
    meta: ['LeftSuper', 'LeftCmd', 'LeftWin'],
    win: ['LeftSuper', 'LeftWin'],
    super: ['LeftSuper', 'LeftWin'],
    ctrl: ['LeftControl'],
    control: ['LeftControl'],
    alt: ['LeftAlt'],
    option: ['LeftAlt'],
    shift: ['LeftShift'],
    enter: ['Return', 'Enter'],
    return: ['Return', 'Enter'],
    escape: ['Escape'],
    esc: ['Escape'],
    tab: ['Tab'],
    space: ['Space'],
    backspace: ['Backspace'],
    delete: ['Delete'],
    up: ['Up'],
    down: ['Down'],
    left: ['Left'],
    right: ['Right'],
  };
  const cands = table[name.toLowerCase()] ?? [name.length === 1 ? name.toUpperCase() : name];
  for (const c of cands) if (K[c] !== undefined) return K[c];
  return undefined;
}

export class NutExecutor implements Executor {
  private mapping: ShotMapping = { sentW: 1, sentH: 1, nutW: 1, nutH: 1 };
  private caps: Capabilities = detectCapabilities();
  private lastElements: UiElement[] = [];

  capabilities(): Capabilities {
    return this.caps;
  }

  async describeUi(): Promise<UiElement[]> {
    this.lastElements = await inspectUi();
    return this.lastElements;
  }

  async clickElement(index: number): Promise<void> {
    await clearOverlays();
    const el = this.lastElements[index];
    if (!el) throw new Error(`elemento ${index} non trovato (usa prima list_elements)`);
    const nut = await loadNut();
    // le coordinate AX sono già nello spazio del sistema di puntamento (nut.js)
    const cx = Math.round(el.x + el.w / 2);
    const cy = Math.round(el.y + el.h / 2);
    await nut.mouse.setPosition(new nut.Point(cx, cy));
    await nut.mouse.click(nut.Button.LEFT);
  }

  async screenshot(): Promise<Screenshot> {
    await clearOverlays();
    const nut = await loadNut();
    const { Jimp } = await import('jimp');
    // lo spazio coordinate di input resta quello di nut.js (per mouse/tastiera)
    const nutW = await nut.screen.width();
    const nutH = await nut.screen.height();

    // Sorgente immagine: preferisci Electron (Registrazione schermo affidabile),
    // altrimenti nut.js (cross-platform / non-Electron).
    let buf: Buffer;
    const shotUrl = process.env.OPENMATE_SHOT_URL;
    if (shotUrl) {
      const res = await fetch(`${shotUrl}?w=${MAX_WIDTH}`);
      if (!res.ok) throw new Error(`screenshot server ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
      // Electron l'ha già catturato alla misura giusta: niente da decodificare né ricodificare
      const size = pngSize(buf);
      if (size && size.width <= MAX_WIDTH) {
        this.mapping = { sentW: size.width, sentH: size.height, nutW, nutH };
        return { pngBase64: buf.toString('base64'), ...size, logicalW: nutW, logicalH: nutH };
      }
    } else {
      const path = await nut.screen.capture(`openmate-${Date.now()}`, nut.FileType.PNG, tmpdir());
      const fullPath = path.endsWith('.png') ? path : join(tmpdir(), `openmate-${Date.now()}.png`);
      buf = await readFile(path.endsWith('.png') ? path : fullPath);
      void rm(path, { force: true }).catch(() => {});
    }

    const image = await Jimp.read(buf);
    if (image.bitmap.width > MAX_WIDTH) image.resize({ w: MAX_WIDTH });
    const out = await image.getBuffer('image/png');
    const sentW = image.bitmap.width;
    const sentH = image.bitmap.height;
    this.mapping = { sentW, sentH, nutW, nutH };
    return {
      pngBase64: out.toString('base64'),
      width: sentW,
      height: sentH,
      logicalW: nutW,
      logicalH: nutH,
    };
  }

  private async point(x: number, y: number) {
    const nut = await loadNut();
    const l = toLogical(x, y, this.mapping);
    return new nut.Point(l.x, l.y);
  }

  private button(nut: Nut, b: MouseButton) {
    return b === 'right' ? nut.Button.RIGHT : b === 'middle' ? nut.Button.MIDDLE : nut.Button.LEFT;
  }

  async move(x: number, y: number): Promise<void> {
    await clearOverlays();
    const nut = await loadNut();
    await nut.mouse.setPosition(await this.point(x, y));
  }

  async click(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
    await clearOverlays();
    const nut = await loadNut();
    await nut.mouse.setPosition(await this.point(x, y));
    await nut.mouse.click(this.button(nut, button));
  }

  async doubleClick(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
    await clearOverlays();
    const nut = await loadNut();
    await nut.mouse.setPosition(await this.point(x, y));
    await nut.mouse.doubleClick(this.button(nut, button));
  }

  async type(text: string): Promise<void> {
    await clearOverlays();
    const nut = await loadNut();
    await nut.keyboard.type(text);
  }

  async key(keys: string[]): Promise<void> {
    await clearOverlays();
    const nut = await loadNut();
    const K = nut.Key as unknown as Record<string, number>;
    const resolved = keys.map((k) => resolveKey(K, k)).filter((v): v is number => v !== undefined);
    if (!resolved.length) return;
    await nut.keyboard.pressKey(...resolved);
    await nut.keyboard.releaseKey(...[...resolved].reverse()); // copia: non mutare resolved
  }

  async scroll(dx: number, dy: number): Promise<void> {
    await clearOverlays();
    const nut = await loadNut();
    if (dy > 0) await nut.mouse.scrollDown(dy);
    else if (dy < 0) await nut.mouse.scrollUp(-dy);
    if (dx > 0) await nut.mouse.scrollRight(dx);
    else if (dx < 0) await nut.mouse.scrollLeft(-dx);
  }
}

export function createExecutor(): Executor {
  return new NutExecutor();
}
