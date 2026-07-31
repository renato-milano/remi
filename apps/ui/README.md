# @openmate/ui — companion desktop (Electron)

Un companion **"senza finestra"**: una finestra trasparente, senza bordi, sempre in primo piano
e **click-through** (i click passano al desktop, tranne quando sei sul personaggio). Un robot 2D
animato con faccia-schermo, pilotato dagli eventi del daemon.

## App unica (onboarding + daemon gestito)
L'app Electron è **una sola cosa da lanciare**: al primo avvio mostra l'**onboarding**
(nome, chiave API, autonomia, tutorial → "schiusa"), poi **avvia e gestisce il daemon**
come processo figlio, passandogli la chiave **cifrata** con `safeStorage`.

```sh
pnpm --filter @openmate/ui dev
```
- **Primo avvio** → finestra di onboarding; al termine salva `config.json` + chiave cifrata
  in `userData`, avvia il daemon e schiude il companion.
- **Avvii successivi** → avvia il daemon e mostra direttamente il companion.
- Per **rifare l'onboarding**: elimina `openmate.config.json` dalla cartella dati dell'app
  (`~/Library/Application Support/@openmate/ui`).

> Nota (dev): il daemon figlio viene avviato con il `node` di sistema su
> `packages/daemon/dist/index.js` — quindi serve `pnpm build` fatto almeno una volta.
> In un'app impacchettata servirà `electron-rebuild` per i moduli nativi.

## Modalità demo (senza chiave, daemon esterno)
Per vedere l'UI animarsi senza chiave API, salta onboarding/daemon con `OPENMATE_EXTERNAL=1`
e usa il demo daemon:
```sh
pnpm --filter @openmate/ui demo                 # demo daemon finto :8787
OPENMATE_EXTERNAL=1 pnpm --filter @openmate/ui dev   # overlay che si collega a :8787
```

## Come funziona
- **Shell** (`electron/main.cjs`): finestra `transparent + frameless + alwaysOnTop + skipTaskbar`
  con click-through; gestisce onboarding, lifecycle del daemon, hotkey globale, menu contestuale,
  drag&drop.
- **Renderer**: si sottoscrive a `GET /events` (SSE) e traduce gli eventi in animazioni del
  personaggio + fumetti + card di approvazione (in linguaggio semplice) + pannello attività;
  invia comandi via `POST /command`.
- **Personaggio**: robot SVG procedurale (glifi cyan per stato); **Rive** come drop-in
  (vedi `assets/README.md`).

Variabili: `OPENMATE_URL` (daemon), `OPENMATE_HOTKEY` (default `⌘⇧O`), `OPENMATE_PORT`.
