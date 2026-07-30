# ADR-0011 — Memoria: oblio = consolida + archivia (mai delete)

**Stato:** Accettato

## Contesto

L'episodic cresce indefinitamente ([03](../03-memory-architecture.md)). Serve una politica di oblio che eviti la crescita illimitata senza perdere informazione utile. Opzioni: consolidare e archiviare, oppure eliminare attivamente il basso valore.

## Decisione

**Consolida + archivia, mai delete di default.** Sull'heartbeat idle, gli episodic non consolidati vengono distillati nella memoria semantica (wiki), poi **archiviati in forma compressa** — non cancellati. L'informazione resta recuperabile e auditabile; la crescita è gestita con compressione/archiviazione, non con la perdita.

## Alternative considerate

- **Ibrido con decay.** Ranking per importanza/recency + archiviazione sotto soglia: contesto più pulito, più "umano", ma il ranking può declassare per errore materiale utile.
- **Oblio attivo con delete.** Storage minimo e molto "umano", ma perdita **irreversibile** di informazioni potenzialmente utili — inaccettabile come default per un agente di cui l'utente si fida.

## Conseguenze

- **+** Nessuna perdita irreversibile; pieno audit e reversibilità ([06](../06-security-and-permissions.md)).
- **+** Il contesto attivo resta snello (l'archivio non è iniettato), pur mantenendo tutto recuperabile via retrieval.
- **−** Lo storage cresce nel tempo (mitigato da compressione/archiviazione a livelli).
- **−** Serve definire il formato/tier di archivio e la sua strategia di ricerca (recupero on-demand).
- Un eventuale *decay* o *hard-delete* opzionale resta configurabile in futuro, ma non è il default.
