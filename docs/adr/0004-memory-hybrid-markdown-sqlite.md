# ADR-0004 — Memoria: substrato ibrido markdown + SQLite

**Stato:** Accettato

## Contesto

La memoria è il cuore di OpenMate ([03](../03-memory-architecture.md)). Serve un substrato di storage che sia insieme **trasparente/ispezionabile** (principio local-first) e **robusto/interrogabile** (per episodic e retrieval). La domanda: chi è la source-of-truth?

## Decisione

Substrato **ibrido**:
- **Wiki semantica** in **file markdown** (con frontmatter + link `[[…]]`): source-of-truth della conoscenza durevole, leggibile e versionabile con Git.
- **Episodic log e indici** (vettoriale `sqlite-vec` + FTS5) in **SQLite** (`better-sqlite3`): robusto, transazionale, interrogabile.

## Alternative considerate

- **Markdown-first puro.** Massima trasparenza, ma richiede reinventare la ricerca/indicizzazione e mal si presta all'episodic ad alto volume.
- **SQLite-first puro.** Robusto e uniforme, ma opaco: l'utente non può leggere/correggere il "cervello" a mano, contro il principio di trasparenza.

## Conseguenze

- **+** Conoscenza durevole leggibile e correggibile dall'utente, versionabile.
- **+** Episodic e retrieval performanti e transazionali in un unico file DB.
- **+** Ogni tipo di dato nel formato più adatto.
- **−** Serve sincronizzazione file ↔ indice (reindicizzazione idempotente, watcher) e gestione dei conflitti se l'utente edita mentre l'agente consolida ([03](../03-memory-architecture.md)).
- **−** Dipendenza da binari nativi (`better-sqlite3`, `sqlite-vec`) su più piattaforme.
