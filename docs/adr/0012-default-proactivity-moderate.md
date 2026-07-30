# ADR-0012 — Proattività di default: moderata

**Stato:** Accettato

## Contesto

OpenMate è un agente autonomo con heartbeat ([ADR-0002](0002-autonomy-cognitive-cycle-heartbeat.md)) e un'esperienza "viva" tamagotchi ([08](../08-ui-tamagotchi.md)). Quanto deve prendere l'iniziativa verso l'utente di default? È un fork di UX: troppo poco = non "vivo"; troppo = invadente e costoso.

## Decisione

**Proattività moderata di default.** Sugli heartbeat l'agente avanza i goal e consolida la memoria in modo silenzioso; **interviene/notifica l'utente solo quando ha qualcosa di utile** e non ripetitivo-urgente. Il livello è **configurabile** ([09](../09-tech-stack-and-repo-layout.md)): l'utente può spostarsi verso "reattivo" o "molto proattivo".

## Alternative considerate

- **Reattivo di default.** Solo manutenzione silenziosa, nessuna iniziativa: meno invadente ma meno "vivo".
- **Molto proattivo.** Iniziativa frequente: massima presenza percepita, ma rischio invadenza, costi e azioni superflue.

## Conseguenze

- **+** Bilancia "vivo" e "non invadente" — coerente col principio *agente attivo, non passivo* ([00](../00-vision-and-principles.md)) senza esagerare.
- **+** Configurabile: l'utente calibra secondo le proprie preferenze.
- **−** La soglia "qualcosa di utile" richiede euristiche/giudizio del modello, da affinare per evitare sia il silenzio sia il rumore.
- Si lega al pre-check deterministico degli heartbeat ([02](../02-agent-loop-and-autonomy.md)) per non attivare cicli costosi senza motivo.
