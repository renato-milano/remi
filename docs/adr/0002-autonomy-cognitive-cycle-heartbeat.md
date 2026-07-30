# ADR-0002 — Autonomia: cognitive cycle a heartbeat

**Stato:** Accettato

## Contesto

OpenMate deve essere **autonomo**, non reattivo soltanto: deve svegliarsi da solo, perseguire obiettivi nel tempo e dare l'impressione di essere "vivo" (tamagotchi). Serve un modello di esecuzione che concili proattività, reattività agli eventi e consolidamento della memoria.

## Decisione

Adottare un **cognitive cycle guidato da heartbeat**: un ciclo mentale ricorrente (percepire → recuperare → pianificare → agire → riflettere → consolidare) attivato sia da **tick periodici idle** sia da **eventi** (input utente, cron, webhook). Il tick idle è anche il momento di consolidamento della memoria ("dorme e sogna"). Dettagli in [02](../02-agent-loop-and-autonomy.md).

## Alternative considerate

- **Event-driven puro.** Più semplice ed economico, ma nessuna vera proattività: l'agente vive solo se stimolato.
- **Goal-oriented con planner persistente separato.** Più potente su obiettivi complessi, ma più pesante; la pianificazione può emergere dal ciclo + stato dei goal senza un planner dedicato.

## Conseguenze

- **+** Proattività reale e continuità: l'agente avanza goal e cura la memoria da solo.
- **+** Il modello di stati (idle/thinking/acting/sleeping) diventa il vocabolario espressivo del tamagotchi ([08](../08-ui-tamagotchi.md)).
- **+** Consolidamento memoria integrato nel ciclo idle ([03](../03-memory-architecture.md)).
- **−** Rischio di costi/loop-runaway → serve pre-check deterministico sugli heartbeat e limiti operativi ([06](../06-security-and-permissions.md)).
- **−** Complessità nella gestione di eventi durante un ciclo in corso (coda vs priorità).
