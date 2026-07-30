# 09 — Stack Tecnologico e Layout del Repository

## Scopo

Fissare lo stack tecnico e la struttura del monorepo, in modo che un contributor sappia dove va cosa e con quali strumenti.

## Stack

| Ambito | Scelta | Note |
|---|---|---|
| Linguaggio | **TypeScript** | Tipi su tutto il core. |
| Runtime | **Node.js 22+ (LTS)** | 22 è la LTS corrente e regge tutto lo stack; 24+ opzionale. |
| Monorepo | **pnpm workspace** | Package multipli, dipendenze condivise. |
| DB embedded | **SQLite** via `better-sqlite3` | Sincrono, veloce, zero server ([03](03-memory-architecture.md)). |
| Vector search | **`sqlite-vec`** | Estensione vettoriale su SQLite. |
| Full-text | **FTS5** | Ricerca keyword nativa SQLite. |
| Embeddings | **Ollama** (`nomic-embed-text`) / **`transformers.js`**, fallback API | Locali di default ([ADR-0006](adr/0006-embeddings-local-with-api-fallback.md)). |
| Reasoning backend | `ReasoningBackend` — OpenMate possiede il loop (B-first) | [07](07-llm-provider-abstraction.md), [ADR-0009](adr/0009-reasoning-backend-own-loop.md). |
| LLM / provider | Astrazione **SDK in-process** (candidata **Vercel AI SDK**) + **OpenAI-compatible base URL**; default **Claude** | [07](07-llm-provider-abstraction.md), [ADR-0010](adr/0010-provider-aggregation-sdk-openai-compatible.md). |
| Computer-use | Cattura schermo + input mouse/tastiera | Backend macOS iniziale ([05](05-device-interaction.md)). |

> **Framework: deciso.** Loop cognitivo e memoria su misura (controllo dei differenziatori); una libreria di astrazione provider (Vercel AI SDK) copre *solo* il layer LLM. Niente framework agent completo (es. Mastra) che imporrebbe un modello di memoria in conflitto con [ADR-0004](adr/0004-memory-hybrid-markdown-sqlite.md)/[0005](adr/0005-memory-agentic-recall.md). Vedi [ADR-0009](adr/0009-reasoning-backend-own-loop.md).

## Layout del monorepo

```
OpenMate/
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── docs/                      # questa documentazione
│   └── adr/                   # architecture decision records
├── packages/
│   ├── core/                  # cognitive loop + macchina a stati (02)
│   ├── scheduler/             # heartbeat + cron + trigger eventi (02)
│   ├── memory/                # memoria a livelli + tool di recall (03)
│   ├── tools/                 # registry + shell, computer-use, file (04, 05)
│   ├── llm/                   # ReasoningBackend + astrazione provider (07)
│   ├── daemon/                # processo + API locale + event stream (01, 08)
│   └── config/                # configurazione, segreti, policy (06)
└── apps/
    └── ui/                    # esperienza tamagotchi (08, futuro)
```

> I nomi dei package sono **normativi** e coerenti con [01](01-architecture-overview.md).

## Configurazione

`packages/config` centralizza:
- profilo/i dell'agente e default del provider LLM ([07](07-llm-provider-abstraction.md));
- **policy di autonomia**: allowlist/denylist shell, percorsi filesystem, limiti operativi ([06](06-security-and-permissions.md));
- intervallo di heartbeat e job cron ([02](02-agent-loop-and-autonomy.md));
- percorsi di storage della memoria (`memory/`, DB SQLite) ([03](03-memory-architecture.md));
- gestione chiavi API (mai in chiaro nei log).

Formato consigliato: file di config human-readable (es. `openmate.config.*`) + variabili d'ambiente per i segreti.

## Storage su disco (default local-first)

```
<user-data>/openmate/
├── memory/
│   ├── WIKI.md               # indice della wiki semantica
│   ├── persona.md            # core memory
│   ├── user-profile.md       # core memory
│   └── notes/*.md            # note semantiche (03)
├── openmate.db               # SQLite: episodic, indici vec/fts, audit (03, 06)
└── openmate.config.*         # configurazione
```

## Strumenti di sviluppo (bozza)

- Type-check e build TS a livello workspace.
- Lint/format condivisi.
- Test unitari sui package core (`memory`, `tools`, `core`).
- Diagrammi in **Mermaid** dentro i markdown.

## Rischi e questioni aperte

- Compatibilità di `better-sqlite3` + `sqlite-vec` come binari nativi su varie piattaforme.
- Dipendenza da runtime esterni per gli embeddings locali (Ollama installato vs `transformers.js` in-process).
- Evoluzione della libreria di astrazione provider (Vercel AI SDK), incapsulata dietro `Provider` ([07](07-llm-provider-abstraction.md)).
