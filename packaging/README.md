# Packaging Remi

Gli installer (macOS `.dmg`, Windows `.exe`, Linux `.AppImage`/`.deb`) sono
prodotti da **electron-builder** in `apps/ui`. Config: `apps/ui/electron-builder.yml`.

## Come funziona (in breve)

- Il **daemon** viene bundlato in un unico file (esbuild) in `apps/ui/build/daemon/daemon.cjs`,
  con i moduli **nativi** (`better-sqlite3`, `@nut-tree-fork/*`, `playwright-core`)
  tenuti esterni. Il bundle viaggia fuori dall'asar (`extraResources`).
- I moduli nativi + le loro dipendenze pure-JS vengono impacchettati e
  **ricompilati per l'ABI di Electron** (electron-builder + `@electron/rebuild`),
  spacchettati in `Resources/app.asar.unpacked/node_modules/`.
- L'app spawna il daemon con il **binario Electron come Node** (`ELECTRON_RUN_AS_NODE=1`)
  e `NODE_PATH` puntato ai nativi spacchettati. Vedi `apps/ui/electron/main.cjs`.

## Build locale

```sh
pnpm install          # con node-linker=hoisted (.npmrc): tree adatto a electron-builder
pnpm build            # compila i package (esbuild inlina i loro dist)
pnpm --filter @openmate/ui dist:mac     # oppure dist:win / dist:linux / dist
```

Gli artefatti finiscono in `apps/ui/dist/`.

> ⚠️ **Gotcha dev**: una build locale con electron-builder **ricompila
> `better-sqlite3` per l'ABI di Electron** nella pnpm store condivisa. Dopo,
> i test/dev su Node di sistema falliscono con `NODE_MODULE_VERSION`. Ripristina
> con un `pnpm install` pulito (`rm -rf node_modules && pnpm install`).
> In CI non succede: ogni runner fa un install pulito.

## Firma (opzionale, attivabile dopo)

Non firmato di default. Per firmare/notarizzare basta fornire i secret via env
(nessun cambio di codice): vedi `apps/ui/build/notarize.cjs` e il workflow
`.github/workflows/release.yml` (`APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD`/`APPLE_TEAM_ID`,
`CSC_LINK`/`CSC_KEY_PASSWORD`, `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`).

## Distribuzione

Al push di un tag `v*`, la CI builda i 3 OS e pubblica gli installer sulla
GitHub Release. macOS si distribuisce via Homebrew cask: vedi `packaging/homebrew/`.
