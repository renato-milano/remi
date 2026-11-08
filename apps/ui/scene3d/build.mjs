// Impacchetta Three.js e la finestra 3D in renderer/build/scene3d.js (niente CDN durante l'uso).
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ui = fileURLToPath(new URL('..', import.meta.url));
await build({
  entryPoints: [`${ui}scene3d/viewer.js`],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome130',
  outfile: `${ui}renderer/build/scene3d.js`,
  sourcemap: true,
  logLevel: 'warning',
});
