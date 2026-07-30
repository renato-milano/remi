# Contribuire a OpenMate

Grazie per l'interesse! OpenMate è in fase di **documentazione fondativa**: non c'è ancora codice, quindi il contributo più prezioso ora è il **confronto sulle scelte architetturali**.

## Come contribuire in questa fase

1. **Leggi i documenti** in [`docs/`](docs/), partendo da [`00-vision-and-principles.md`](docs/00-vision-and-principles.md).
2. **Discuti le decisioni** — ogni scelta chiave è tracciata in un [ADR](docs/adr/). Se non sei d'accordo con una decisione o vedi un'alternativa migliore, apri una issue che cita l'ADR relativo.
3. **Proponi modifiche ai doc** via Pull Request, seguendo le convenzioni sotto.

## Convenzioni della documentazione

- Ogni documento di sottosistema segue la struttura: **Scopo → Decisione → Alternative considerate → Interfacce/Schemi → Rischi/Aperti**.
- I diagrammi usano [Mermaid](https://mermaid.js.org/) (renderizzato da GitHub).
- Lingua dei documenti: **italiano**. Identificatori, nomi di file/package e snippet di codice: **inglese**.
- Terminologia della memoria uniforme ovunque: *core / working / episodic / semantic*.
- I nomi dei package restano coerenti tra `01-architecture-overview.md` e `09-tech-stack-and-repo-layout.md`.

## Quando inizierà lo sviluppo

La roadmap è in [`docs/10-roadmap.md`](docs/10-roadmap.md). L'MVP partirà da: daemon + cognitive loop + shell tool + memoria base + provider Claude + CLI di interazione.

## Codice di condotta

Sii rispettoso e costruttivo. Le discussioni tecniche sono benvenute; gli attacchi personali no.
