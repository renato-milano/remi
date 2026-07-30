# ADR-0008 — Shell: subprocess con permessi + audit

**Stato:** Accettato

## Contesto

L'agente ha bisogno di eseguire comandi shell come superficie d'esecuzione primaria per task non-GUI. Questo è potente e rischioso, specie in un agente **autonomo**. Va deciso il modello di esecuzione e di contenimento.

## Contesto di fiducia

OpenMate è mono-utente e local-first: l'utente è il proprietario fidato della macchina; **non** difendiamo tra utenti diversi (niente sandbox multi-utente — [non-goal](../00-vision-and-principles.md#non-goals-esplicitamente-fuori-scope)). Difendiamo da **azioni autonome indesiderate**.

## Decisione

Eseguire i comandi come **subprocess** con un **layer di permessi + audit**, non in sandbox Docker/SSH:
- **allowlist/denylist** di comandi/pattern;
- comandi ad alto impatto → **approval gate** ([06](../06-security-and-permissions.md));
- **audit log** append-only di ogni esecuzione;
- timeout, limiti di output, working directory controllata, kill-switch via `AbortSignal`.

## Alternative considerate

- **Accesso shell libero.** Semplice ma inaccettabile per un agente autonomo: nessun contenimento degli errori/allucinazioni.
- **Sandbox Docker/SSH (stile OpenClaw).** Forte isolamento, ma pensato per multi-utente/gruppi: overhead e complessità ingiustificati per un agente personale mono-utente.

## Conseguenze

- **+** Semplice e leggero, adatto al contesto mono-utente local-first.
- **+** Contenimento degli errori tramite permessi, approvazioni e limiti operativi.
- **+** Accountability completa via audit ([06](../06-security-and-permissions.md)).
- **−** Nessun isolamento forte dal sistema host: la sicurezza dipende dalla qualità di allowlist/policy e degli approval gate.
- **−** Esposizione a prompt injection che tenti di indurre comandi dannosi → mitigata da privilegi minimi e conferme sui `dangerous`.
