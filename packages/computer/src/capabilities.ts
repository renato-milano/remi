import type { Capabilities } from './types.js';

/**
 * Rileva se il computer-use è supportato sulla piattaforma corrente.
 * macOS/Windows/Linux-X11: ok. Linux-Wayland: iniezione input non supportata
 * da libnut → non supportato (con motivo).
 */
export function detectCapabilities(env: NodeJS.ProcessEnv = process.env): Capabilities {
  const platform = process.platform;
  if (platform === 'linux') {
    const wayland = env.XDG_SESSION_TYPE === 'wayland' || Boolean(env.WAYLAND_DISPLAY);
    if (wayland) {
      return {
        supported: false,
        platform,
        reason:
          "Sessione Wayland rilevata: l'iniezione di mouse/tastiera non è supportata. Usa una sessione X11.",
      };
    }
  }
  return { supported: true, platform };
}
