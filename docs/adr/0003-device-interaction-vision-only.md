# ADR-0003 — Interazione device: computer-use solo vision

**Stato:** Accettato

## Contesto

OpenMate deve interagire col sistema usando mouse e tastiera per operare su qualunque applicazione GUI, come farebbe l'utente. Le strade sono: "vedere" lo schermo con un modello vision, oppure automazione scriptata via API OS (AppleScript/Accessibility), o entrambe.

## Decisione

Interagire col dispositivo **esclusivamente tramite computer-use vision**: screenshot → modello vision-capable interpreta e decide → azione mouse/tastiera → verifica. Nessun percorso scriptato OS-specifico nel core. Dettagli in [05](../05-device-interaction.md).

## Alternative considerate

- **Automazione scriptata (pyautogui/AppleScript/Accessibility).** Veloce, deterministica e a basso costo, ma fragile, OS-specifica e limitata alle app che espongono API/accessibilità.
- **Entrambi (scriptato + vision fallback).** Più robusto ma raddoppia i paradigmi da mantenere; rimandato.

## Conseguenze

- **+** Massima generalità: funziona con qualunque app, anche senza API.
- **+** Un solo paradigma coerente con un agente general-purpose che "vede".
- **−** Latenza e costo elevati su cicli frequenti → mitigati (no vision su ogni heartbeat, screenshot ridimensionati, budget di step) ([05](../05-device-interaction.md)).
- **−** Richiede un modello **vision-capable** nel provider di default ([ADR-0007](0007-llm-provider-abstraction.md)).
- **−** Sfide di grounding (coordinate corrette) e permessi macOS (Screen Recording/Accessibility).
