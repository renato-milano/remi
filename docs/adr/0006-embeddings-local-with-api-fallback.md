# ADR-0006 — Embeddings: locali con fallback API

**Stato:** Accettato

## Contesto

Il retrieval semantico ([03](../03-memory-architecture.md)) richiede embedding. Gli embedding sono calcolati sui contenuti della memoria — potenzialmente dati personali. Scelta tra calcolo locale e API cloud.

## Decisione

**Embeddings locali di default, con fallback API**:
- Default: modello locale (Ollama `nomic-embed-text` o `transformers.js`).
- Fallback: provider API (es. OpenAI/Voyage) se il runtime locale non è disponibile o su richiesta.

## Alternative considerate

- **Solo locali.** Massima privacy e local-first, zero rete, ma qualità potenzialmente inferiore e dipendenza da un runtime locale installato.
- **Solo API.** Qualità migliore e zero setup, ma richiede rete, ha un costo e **invia i contenuti della memoria a terzi** — contro il principio local-first.

## Conseguenze

- **+** Privacy by-default: i contenuti della memoria non lasciano il dispositivo nel caso normale ([06](../06-security-and-permissions.md)).
- **+** Funziona offline; nessun costo ricorrente per l'indicizzazione.
- **+** Resilienza: il fallback evita blocchi se il locale non è disponibile.
- **−** Dipendenza da runtime esterno (Ollama installato) o da modello in-process (`transformers.js`).
- **−** La dimensione dell'embedding del modello scelto vincola lo schema `vec0` in SQLite; cambiare modello richiede reindicizzazione.
- **−** Il fallback API deve essere esplicito/consentito per non esfiltrare dati inavvertitamente.
