# 12 — Packaging e Distribuzione

## Scopo

Come Remi diventa un **installer a doppio clic** per utenti non tecnici (macOS,
Windows, Linux) e come arriva agli utenti. Config di riferimento:
[`apps/ui/electron-builder.yml`](../apps/ui/electron-builder.yml),
guida operativa in [`packaging/README.md`](../packaging/README.md).

## Il nodo: il daemon

Il daemon (`packages/daemon`) è un **processo Node separato**, non self-contained,
con moduli nativi. In un'app pacchettizzata non esiste un `node` di sistema né il
monorepo. Soluzione:

- **Bundle esbuild** del daemon in un unico CJS (`packages/daemon/src/entry.ts` →
  `apps/ui/build/daemon/daemon.cjs`), con i nativi tenuti **esterni**
  (`better-sqlite3`, `@nut-tree-fork/*`, `playwright-core`).
- In pacchetto il daemon gira col **binario Electron come Node**
  (`ELECTRON_RUN_AS_NODE=1` + `process.execPath`) e **`NODE_PATH`** ai nativi
  spacchettati (`app.asar.unpacked/node_modules`). In dev resta invariato (spawn
  `node` di sistema sull'ESM). Vedi `apps/ui/electron/main.cjs`.
- `asarUnpack: node_modules/**` così ogni nativo sta su disco insieme ai suoi
  helper pure-JS (es. `bindings`). electron-builder ricompila i nativi per l'ABI
  di Electron (pin `electronVersion`).

## Piattaforme e firma

- **macOS**: due `.dmg` (arm64 + x64). **Windows**: `.exe` NSIS one-click.
  **Linux**: AppImage + `.deb`.
- **Non firmato** di default. La firma/notarizzazione è **condizionale via env**
  (`apps/ui/build/notarize.cjs` + secret in CI): assenti → build non firmata;
  con `CSC_LINK`/`APPLE_*` la firma avviene senza cambi di codice. Su macOS in CI
  senza cert si passa `-c.mac.identity=null` per saltare la firma.

## Release e distribuzione

- **CI** [`.github/workflows/release.yml`](../.github/workflows/release.yml): al
  tag `v*` (o `workflow_dispatch`), matrix mac/win/linux → build + pubblicazione
  su una **Release in bozza**. Nomi artifact **fissi** (`Remi-mac-arm64.dmg`,
  `Remi-win-x64.exe`, `Remi-linux.AppImage`…) → URL stabili
  `releases/latest/download/…`.
- **I binari stanno su GitHub Releases**; la landing (holyn.it) li **linka**
  (widget `packaging/website-download.html`). Non si ospitano i file altrove.
- **macOS via Homebrew**: tap `renato-milano/homebrew-remi`
  ([`packaging/homebrew/`](../packaging/homebrew/)); il cask rimuove la quarantena
  (l'app non è firmata). Aggiornato in automatico a ogni release da
  [`.github/workflows/update-homebrew.yml`](../.github/workflows/update-homebrew.yml).

## Rilasciare una nuova versione

1. Bump `version` in `apps/ui/package.json`.
2. Tag `vX.Y.Z` (o lancia il workflow) → la CI builda e crea la bozza.
3. Rivedi e **pubblica** la Release → i download diventano vivi e il tap Homebrew
   si aggiorna da solo.

## Prossimi passi

Notarizzazione macOS (account Apple) per togliere il passo "Apri comunque" e il
`brew trust`; auto-update in-app (i `latest*.yml` sono già generati).
