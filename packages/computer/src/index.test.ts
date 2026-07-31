import { describe, expect, it } from 'vitest';
import { detectCapabilities } from './capabilities.js';
import { toLogical } from './scaling.js';

describe('@openmate/computer — toLogical', () => {
  it('mappa 1:1 quando immagine e schermo coincidono', () => {
    const m = { sentW: 1000, sentH: 800, nutW: 1000, nutH: 800 };
    expect(toLogical(500, 400, m)).toEqual({ x: 500, y: 400 });
  });

  it('scala da immagine downscalata a schermo (retina/downscale)', () => {
    // immagine inviata 1366x854, schermo nut 1512x945 → fattore ~1.107
    const m = { sentW: 1366, sentH: 854, nutW: 1512, nutH: 945 };
    expect(toLogical(683, 427, m)).toEqual({ x: 756, y: 473 }); // centro → centro
  });

  it('mappa l\'angolo in basso a destra', () => {
    const m = { sentW: 1366, sentH: 768, nutW: 2732, nutH: 1536 };
    expect(toLogical(1366, 768, m)).toEqual({ x: 2732, y: 1536 });
  });
});

describe('@openmate/computer — detectCapabilities', () => {
  it('Linux/Wayland non supportato con motivo', () => {
    const caps = detectCapabilities({ XDG_SESSION_TYPE: 'wayland' });
    // vale solo se giriamo su linux; su altre piattaforme resta supportato
    if (process.platform === 'linux') {
      expect(caps.supported).toBe(false);
      expect(caps.reason).toMatch(/Wayland/);
    } else {
      expect(caps.supported).toBe(true);
    }
  });

  it('ambiente non-Wayland è supportato', () => {
    expect(detectCapabilities({}).supported).toBe(true);
  });
});
