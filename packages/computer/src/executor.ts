import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectCapabilities } from './capabilities.js';
import { type ShotMapping, toLogical } from './scaling.js';
import type { Capabilities, Executor, MouseButton, Screenshot } from './types.js';

/** Larghezza massima dell'immagine inviata al modello (grounding + token). */
const MAX_WIDTH = 1366;

type Nut = typeof import('@nut-tree-fork/nut-js');
let nutPromise: Promise<Nut> | undefined;
function loadNut(): Promise<Nut> {
  // import lazy: carica il modulo nativo solo quando serve davvero
  nutPromise ??= import('@nut-tree-fork/nut-js');
  return nutPromise;
}

/** Risolve un nome di tasto ("cmd", "enter"…) nel valore Key di nut.js. */
function resolveKey(K: Record<string, number>, name: string): number | undefined {
  const table: Record<string, string[]> = {
    cmd: ['LeftCmd', 'LeftSuper', 'LeftWin'],
    command: ['LeftCmd', 'LeftSuper', 'LeftWin'],
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

  capabilities(): Capabilities {
    return this.caps;
  }

  async screenshot(): Promise<Screenshot> {
    const nut = await loadNut();
    const { Jimp } = await import('jimp');
    const nutW = await nut.screen.width();
    const nutH = await nut.screen.height();
    const path = await nut.screen.capture(`openmate-${Date.now()}`, nut.FileType.PNG, tmpdir());
    const fullPath = path.endsWith('.png') ? path : join(tmpdir(), `openmate-${Date.now()}.png`);
    const buf = await readFile(path.endsWith('.png') ? path : fullPath);
    void rm(path, { force: true }).catch(() => {});

    const image = await Jimp.read(buf);
    if (image.bitmap.width > MAX_WIDTH) image.resize({ w: MAX_WIDTH });
    const out = await image.getBuffer('image/png');
    const sentW = image.bitmap.width;
    const sentH = image.bitmap.height;
    this.mapping = { sentW, sentH, nutW, nutH };
    return { pngBase64: out.toString('base64'), width: sentW, height: sentH };
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
    const nut = await loadNut();
    await nut.mouse.setPosition(await this.point(x, y));
  }

  async click(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
    const nut = await loadNut();
    await nut.mouse.setPosition(await this.point(x, y));
    await nut.mouse.click(this.button(nut, button));
  }

  async doubleClick(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
    const nut = await loadNut();
    await nut.mouse.setPosition(await this.point(x, y));
    await nut.mouse.doubleClick(this.button(nut, button));
  }

  async type(text: string): Promise<void> {
    const nut = await loadNut();
    await nut.keyboard.type(text);
  }

  async key(keys: string[]): Promise<void> {
    const nut = await loadNut();
    const K = nut.Key as unknown as Record<string, number>;
    const resolved = keys.map((k) => resolveKey(K, k)).filter((v): v is number => v !== undefined);
    if (!resolved.length) return;
    await nut.keyboard.pressKey(...resolved);
    await nut.keyboard.releaseKey(...resolved.reverse());
  }

  async scroll(dx: number, dy: number): Promise<void> {
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
