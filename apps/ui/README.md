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

## Quaderno e moviola
- **Quaderno** (⌘⇧Y / Ctrl+Shift+Y, l'icona di Remi nella barra dei menu o nell'area di notifica,
  il menu del personaggio, il pulsante nella barra del modello 3D):
  ogni lavagna, modello 3D, scena animata e risposta ai turni «indica» finisce in
  `userData/notebook`, divisa per argomento. L'argomento lo propone il daemon
  (`POST /notebook/topic`, chiamata breve), la miniatura la fa una finestra fuori schermo che carica
  la lavagna o il visore veri (`electron/notebook.cjs`). Da lì si riapre, si riascolta, si continua
  con una domanda, si sposta di argomento. Le sessioni salvate con `OPENMATE_UI_DEBUG` prima del
  quaderno si importano una volta sola alla prima apertura.
- **Moviola**: le scene con traiettorie hanno una barra del tempo con play, velocità ¼× ½× 1×,
  marcatori sui contatti dichiarati, scie con pose fantasma e «Segui». Spazio = play/pausa,
  frecce = marcatore precedente/successivo.
- Prove: `pnpm --filter @openmate/ui test:scene3d` e `pnpm --filter @openmate/ui test:notebook`.

Icona nella barra: si toglie dalle Impostazioni («Accesso rapido», `ui.tray` nel config).

Variabili: `OPENMATE_NOTEBOOK_HOTKEY` (default `CommandOrControl+Shift+Y`), `OPENMATE_URL` (daemon), `OPENMATE_HOTKEY` (default `⌘⇧O`), `OPENMATE_PORT`.
