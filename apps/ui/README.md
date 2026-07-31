# @openmate/ui — overlay tamagotchi (Electron)

Un companion **"senza finestra"**: una finestra trasparente, senza bordi, sempre in primo piano
e **click-through** (i click passano al desktop, tranne quando sei sul personaggio). Dentro,
un personaggio 2D animato pilotato dagli eventi del daemon.

## Come funziona
- **Shell** (`electron/main.cjs`): finestra `transparent + frameless + alwaysOnTop + skipTaskbar`,
  con `setIgnoreMouseEvents(true, {forward:true})` per il click-through. Il renderer riattiva
  l'interattività quando il mouse è sul personaggio (hit-test su `.interactive`).
- **Renderer**: si sottoscrive a `GET /events` (SSE) del daemon e traduce gli eventi:
  - `state` → posa/animazione del personaggio (`idle/thinking/acting/sleeping/waiting_approval`)
  - `action` / `message` → fumetto
  - `approval_request` → prompt **Consenti / Nega** → `POST /command`
  - input in basso → `POST /command { user_message }`
- **Personaggio**: placeholder SVG ora, **Rive** come drop-in (vedi `assets/README.md`).

## Avvio
```sh
# 1) avvia il daemon (in un terminale)
export OPENMATE_ANTHROPIC_API_KEY=sk-…      # opzionale: senza chiave i cicli LLM falliscono
pnpm --filter @openmate/daemon dev          # :8787

# 2) avvia l'overlay (in un altro terminale)
pnpm --filter @openmate/ui dev
```
Variabile `OPENMATE_URL` per puntare a un daemon diverso (default `http://127.0.0.1:8787`).

Senza daemon, il personaggio appare comunque (stato `idle`) e prova a riconnettersi.
