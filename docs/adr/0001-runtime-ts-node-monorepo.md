# ADR-0001 — Runtime: monorepo TypeScript/Node

**Stato:** Accettato

## Contesto

OpenMate deve integrare loop cognitivo, memoria, tool (shell + computer-use), astrazione LLM e, in futuro, una UI "viva". Serve un runtime con buon ecosistema per agenti AI e per UI, e un'organizzazione che tenga insieme più componenti.

## Decisione

Costruire OpenMate come **monorepo TypeScript/Node** (pnpm workspace), sul modello di [OpenClaw](https://github.com/openclaw/openclaw).

## Alternative considerate

- **Python daemon + UI separata.** Ecosistema AI più ricco e prototipazione rapida, ma due linguaggi (Python core + JS UI) e integrazione UI meno naturale.
- **Hybrid Python core + Tauri/Electron UI.** Best-of-both ma maggiore complessità di setup e IPC.

## Conseguenze

- **+** Un solo linguaggio per backend e futura UI; ottima integrazione con lo stack UI tamagotchi.
- **+** Tipizzazione forte end-to-end; coerenza col riferimento OpenClaw.
- **+** Package multipli con dipendenze condivise (vedi [09](../09-tech-stack-and-repo-layout.md)).
- **−** Ecosistema AI/embeddings meno maturo che in Python → mitigato con `transformers.js`/Ollama ([ADR-0006](0006-embeddings-local-with-api-fallback.md)).
- La valutazione framework agent vs su misura è **risolta** in [ADR-0009](0009-reasoning-backend-own-loop.md)/[ADR-0010](0010-provider-aggregation-sdk-openai-compatible.md): loop su misura + libreria solo per il layer provider.
