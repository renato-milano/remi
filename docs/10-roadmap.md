# 10 — Roadmap

## Scopo

Tracciare le fasi di sviluppo dalla documentazione fondativa a un agente completo, così che un contributor sappia **da dove iniziare** e in che ordine costruire.

## Fase 0 — Documentazione fondativa ✅ (attuale)

Definire visione, architettura e decisioni chiave (questi documenti + gli [ADR](adr/)). Nessun codice. Obiettivo: allineamento sulle scelte.

## Fase 1 — MVP: agente autonomo minimo

Il nucleo funzionante, senza UI grafica. **Piano dettagliato ed eseguibile:** [11 — Piano di Implementazione MVP](11-mvp-implementation-plan.md).

- **`packages/daemon`** — processo con API locale + event stream ([01](01-architecture-overview.md), [08](08-ui-tamagotchi.md)).
- **`packages/core`** — cognitive loop base (perceive → plan → act → reflect) e macchina a stati ([02](02-agent-loop-and-autonomy.md)).
- **`packages/scheduler`** — heartbeat con intervallo configurabile ([02](02-agent-loop-and-autonomy.md)).
- **`packages/llm`** — `ReasoningBackend` con **`DirectProviderBackend`** (OpenMate possiede il loop) + astrazione provider (default **Claude**) ([07](07-llm-provider-abstraction.md), [ADR-0009](adr/0009-reasoning-backend-own-loop.md)).
- **`packages/tools`** — registry + **`shell.run`** con permessi/audit ([04](04-tools-and-capabilities.md), [06](06-security-and-permissions.md)).
- **`packages/memory`** — versione base: core memory + episodic (SQLite) + wiki markdown + `memory.search/read/write/log` ([03](03-memory-architecture.md)).
- **CLI di interazione** — client sottile sul contratto d'interfaccia ([08](08-ui-tamagotchi.md)).

**Definition of done:** l'agente si sveglia su heartbeat, mantiene goal/task, esegue comandi shell con approvazione, e ricorda tra le sessioni.

## Fase 2 — Computer-use vision

- Tool `computer.screenshot/click/type/scroll/key` ([05](05-device-interaction.md)).
- Loop di computer-use dentro la fase Act, con permessi `dangerous` e kill-switch ([06](06-security-and-permissions.md)).
- Gestione permessi macOS (Screen Recording / Accessibility).

**Definition of done:** l'agente completa un task GUI reale vedendo lo schermo e agendo, con conferme sulle azioni rischiose.

## Fase 3 — Memoria cognitiva completa

- **Retrieval ibrido**: `sqlite-vec` + FTS5 + recency ([03](03-memory-architecture.md)).
- **Embeddings** locali + fallback API ([ADR-0006](adr/0006-embeddings-local-with-api-fallback.md)).
- **Consolidation** sull'heartbeat: episodic → semantic, oblio/prune.
- Grafo della wiki con link `[[…]]` e reindicizzazione idempotente.

**Definition of done:** l'agente distilla autonomamente esperienza in conoscenza durevole e la richiama in modo pertinente.

## Fase 4 — Esperienza tamagotchi

- **`apps/ui`** — UI viva che consuma l'API/event stream ([08](08-ui-tamagotchi.md)).
- Mapping stati → mood, presenza ambientale, proattività calibrata.

**Definition of done:** l'agente è percepito come una presenza viva, non una chat.

## Fase 5 — Estensibilità e oltre

- **`LocalAgentBackend`** — backend adapter verso coding agent locali (Claude Code/Codex, stile paperclip), con capacità OpenMate esposte via **MCP** ([ADR-0009](adr/0009-reasoning-backend-own-loop.md)).
- Sistema di **skills** installabili ([04](04-tools-and-capabilities.md)).
- Tool `browser.*`, integrazioni aggiuntive.
- Portabilità computer-use oltre macOS ([05](05-device-interaction.md)).
- Eventuale registry pubblico di skill.

## Principio di sequenziamento

Ogni fase produce qualcosa di **utilizzabile** e costruisce sulla precedente. La memoria cresce di sofisticazione in parallelo (base in Fase 1, completa in Fase 3) perché è il differenziatore centrale del progetto ([03](03-memory-architecture.md)).
