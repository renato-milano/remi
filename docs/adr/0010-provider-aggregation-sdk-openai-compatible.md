# ADR-0010 — Aggregazione provider: astrazione SDK in-process + OpenAI-compatible

**Stato:** Accettato

## Contesto

Deciso che OpenMate possiede il loop ([ADR-0009](0009-reasoning-backend-own-loop.md)), resta il problema pratico: integrare molti provider/modelli **senza** cablare a mano ogni libreria. La tentazione è usare un "aggregatore". Ma "aggregatore" copre approcci con implicazioni molto diverse sulla privacy e sul local-first.

## Decisione

`packages/llm` espone un'interfaccia `Provider` con **due meccanismi di integrazione**:

1. **Astrazione SDK in-process (default)** — una libreria TS-native (candidata di riferimento: **Vercel AI SDK**) che unifica chat, tool-use, vision e streaming tramite package per provider. Tutto nel processo, nessun servizio esterno.
2. **Endpoint OpenAI-compatible via base URL (escape hatch universale)** — accettare un base URL OpenAI-compatibile copre con un solo adattatore: **Ollama** locale, **LiteLLM** self-hosted e aggregatori hosted (es. **OpenRouter**) come *opt-in*.

Gli **aggregatori hosted** (OpenRouter/Portkey/…) sono supportati **solo come opzione esplicita**, mai come default, perché instradano i prompt attraverso terzi.

## Alternative considerate

- **Integrare ogni SDK provider a mano.** Massimo controllo, ma lavoro tedioso e duplicato; scartato.
- **Aggregatore hosted come default.** Comodissimo (una chiave → tutti i modelli), ma **viola local-first/privacy** ([ADR-0006](0006-embeddings-local-with-api-fallback.md), [06](../06-security-and-permissions.md)): i contenuti (inclusa la memoria) passano da un terzo. Declassato a opt-in.
- **Solo OpenAI-compatible (senza SDK).** Minimo comune denominatore, ma tool-use/vision hanno troppe divergenze tra provider per affidarsi solo alla convenzione.

## Conseguenze

- **+** Un solo modo di parlare coi modelli nel core; niente lock-in a un singolo provider.
- **+** Local-first preservato di default; l'utente sceglie consapevolmente se usare un hosted aggregator.
- **+** Modelli locali (Ollama) e proxy self-hosted (LiteLLM) coperti gratis dall'escape hatch.
- **−** **Le astrazioni perdono colpi su tool-use e vision**: servono comunque *capability detection* ([07](../07-llm-provider-abstraction.md)) e piccoli shim per-provider per le divergenze. Un aggregatore non uniforma il computer-use vision, che resta il punto più delicato.
- **−** Dipendenza da una libreria di astrazione esterna (rischio evolutivo) — mitigato dall'interfaccia `Provider` che la incapsula.
