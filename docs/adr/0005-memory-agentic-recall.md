# ADR-0005 — Memoria: recall agentico + core iniettata

**Stato:** Accettato

## Contesto

Definito il substrato ([ADR-0004](0004-memory-hybrid-markdown-sqlite.md)), resta da decidere **come la memoria arriva nel contesto** del modello: iniezione automatica (RAG) o gestione attiva da parte dell'agente.

## Decisione

**Recall agentico con core memory sempre iniettata**:
- I blocchi di **core memory** (`persona`, `user`) sono **sempre** nel prompt.
- Per tutto il resto, l'agente dispone di **tool** (`memory.search/read/write/link/log`) e **decide lui** quando cercare, leggere o scrivere. Niente RAG automatico. Dettagli in [03](../03-memory-architecture.md).

## Alternative considerate

- **RAG automatico.** A ogni turno recupera e inietta memorie rilevanti: semplice, ma passivo, rumoroso e poco controllabile; l'agente non "possiede" il proprio ricordare.
- **Agentica pura (senza core iniettata).** Massimo controllo ma perde continuità d'identità: la persona andrebbe recuperata a ogni ciclo.

## Conseguenze

- **+** Coerente col principio "agente attivo, non passivo" ([00](../00-vision-and-principles.md)): l'agente cura il proprio cervello.
- **+** Contesto più pulito e mirato; sposa la wiki markdown (l'agente fa `search`/`read` sui propri appunti).
- **+** Continuità di identità garantita dalla core memory sempre presente.
- **−** Più chiamate/round-trip: l'agente deve *decidere* di cercare, e a volte può non farlo quando servirebbe.
- **−** Richiede tool di memoria ben progettati e prompt che educhino l'agente a usarli.
