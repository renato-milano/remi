# OpenMate — estensione controllo browser (fase 2)

Componente **isolato e distribuibile a parte**: un'estensione Chrome (Manifest V3) che permette a OpenMate di pilotare la **scheda attiva del tuo Chrome** — con i tuoi login e sessioni reali — invece di una sessione autonoma separata.

## Come funziona
- L'estensione usa `chrome.debugger` per attaccarsi alla scheda attiva (CDP sulla scheda **live**).
- Apre un WebSocket verso il daemon di OpenMate (`ws://127.0.0.1:8787/ext`) e fa da **ponte**: riceve operazioni (open/snapshot/click/type/read/back) ed esegue nella scheda via `chrome.debugger`, rimandando il risultato.
- Comunica col daemon **solo** via WebSocket: nessun accoppiamento col codice del daemon.

## Installazione (sviluppo)
1. In OpenMate → Impostazioni → Controllo del browser: attiva e scegli modalità **Estensione (Chrome live)**. Salva (riavvia il daemon).
2. In Chrome: `chrome://extensions` → attiva **Modalità sviluppatore** → **Carica non pacchettizzata** → seleziona questa cartella (`apps/extension`).
3. Apri la scheda su cui vuoi far lavorare l'agente e **clicca l'icona** dell'estensione: il badge diventa **ON** (attaccata + connessa al daemon). Ri-clicca per scollegare.

> Nota: Chrome mostrerà un avviso "…è in fase di debug". È normale (è `chrome.debugger`). Scollega dall'icona per farlo sparire.

## Distribuzione
- **Oggi (zip + carica non pacchettizzata):** ogni Release allega
  `remi-chrome-extension.zip` — link stabile
  `https://github.com/renato-milano/remi/releases/latest/download/remi-chrome-extension.zip`.
  L'utente lo scompatta e fa "Carica non pacchettizzata" sulla cartella
  `Remi Browser Extension`. Lo zip è generato dal job `extension` in
  `.github/workflows/release.yml`. Adatto a tester/utenti che accettano la
  Modalità sviluppatore (Chrome tiene un banner "in debug" e ogni tanto avvisa).
- **Domani (un clic):** pubblicazione sul **Chrome Web Store** → "Aggiungi a
  Chrome" (serve account dev $5 + review). Unica via senza Modalità sviluppatore.
