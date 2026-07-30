# Architecture Decision Records (ADR)

Gli ADR tracciano le **decisioni architetturali significative** di OpenMate: cosa è stato deciso, in quale contesto, quali alternative sono state scartate e con quali conseguenze. Servono a dare memoria alle scelte e a rendere il progetto criticabile e contribuibile.

Formato di ogni ADR: **Stato · Contesto · Decisione · Alternative considerate · Conseguenze**.

| # | Decisione | Stato |
|---|---|---|
| [0001](0001-runtime-ts-node-monorepo.md) | Runtime: monorepo TypeScript/Node | Accettato |
| [0002](0002-autonomy-cognitive-cycle-heartbeat.md) | Autonomia: cognitive cycle a heartbeat | Accettato |
| [0003](0003-device-interaction-vision-only.md) | Interazione device: computer-use solo vision | Accettato |
| [0004](0004-memory-hybrid-markdown-sqlite.md) | Memoria: substrato ibrido markdown + SQLite | Accettato |
| [0005](0005-memory-agentic-recall.md) | Memoria: recall agentico + core iniettata | Accettato |
| [0006](0006-embeddings-local-with-api-fallback.md) | Embeddings: locali con fallback API | Accettato |
| [0007](0007-llm-provider-abstraction.md) | LLM: astrazione multi-provider, default Claude | Accettato |
| [0008](0008-shell-permission-model.md) | Shell: subprocess con permessi + audit | Accettato |
| [0009](0009-reasoning-backend-own-loop.md) | Reasoning backend: OpenMate possiede il loop (B-first) | Accettato |
| [0010](0010-provider-aggregation-sdk-openai-compatible.md) | Aggregazione provider: SDK in-process + OpenAI-compatible | Accettato |
| [0011](0011-memory-forgetting-consolidate-archive.md) | Memoria: oblio = consolida + archivia (mai delete) | Accettato |
| [0012](0012-default-proactivity-moderate.md) | Proattività di default: moderata | Accettato |

> Tutte le decisioni sono state validate con l'utente in fase di brainstorming fondativo. Le alternative scartate restano documentate per poterle riconsiderare.
