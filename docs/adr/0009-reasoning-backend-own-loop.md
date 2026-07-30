# ADR-0009 — Reasoning backend: OpenMate possiede il loop (B-first)

**Stato:** Accettato

## Contesto

Il "cervello" di OpenMate può essere strutturato in due modi:
- **A) Adapter verso coding agent locali** (stile [paperclip](https://github.com/paperclipai/paperclip)): delegare il loop di ragionamento+esecuzione a un agente esistente (Claude Code/Codex/Cursor), con OpenMate come livello di orchestrazione + memoria + personalità.
- **B) OpenMate è l'agente**: esegue il proprio loop chiamando direttamente gli endpoint dei modelli, con auth pluggable (chiave API o subscription dove lecito).

Osservazione chiave emersa dal brainstorming: **auth/costo** (riuso di una subscription) e **proprietà del loop cognitivo** sono questioni *ortogonali*. Il riuso della subscription è ottenibile anche in B; l'unico vantaggio esclusivo di A è non costruire il motore di esecuzione.

## Decisione

**B-first: OpenMate possiede il proprio cognitive loop.** Il ragionamento passa da un'interfaccia astratta **`ReasoningBackend`** con implementazione di default **`DirectProviderBackend`** (provider/modello selezionabili dall'utente, auth pluggable). Un **`LocalAgentBackend`** (adapter stile A) resta previsto come backend alternativo *pluggable* in una fase successiva ([10](../10-roadmap.md)). Le capacità di OpenMate (memoria, computer-use, tool) sono esposte come tool condivisi (via MCP) così da essere usabili da entrambi i backend.

## Alternative considerate

- **A-first (adapter primario).** Time-to-MVP più rapido e riuso subscription, ma: (1) i coding agent sono ottimizzati per il *dominio codice*, non per l'assistente personale general-purpose; (2) il **computer-use vision** ([ADR-0003](0003-device-interaction-vision-only.md)) non è nativo in agenti da terminale; (3) la **memoria cognitiva** ([ADR-0005](0005-memory-agentic-recall.md)) andrebbe iniettata indirettamente; (4) l'**identità "viva"** tamagotchi mal si sposa con agenti task/session-oriented; (5) accoppiamento fragile a CLI esterne. In sintesi: A è forte dove OpenMate è debole, e debole dove OpenMate deve essere forte.
- **Solo DirectProvider (nessun adapter mai).** Più semplice, ma rinuncia a priori al riuso di agenti locali che alcuni utenti potrebbero volere.

## Conseguenze

- **+** Controllo deterministico del ciclo perceive→…→consolidate; i tre differenziatori (memoria cognitiva, computer-use vision, esperienza viva) si integrano nativamente.
- **+** L'astrazione `ReasoningBackend` non chiude la porta ad A: adapter aggiungibile senza riscrivere il core.
- **+** Comportamento coerente e prevedibile su un'unica superficie.
- **−** Dobbiamo costruire/mantenere il loop agentico, la normalizzazione tool-use e lo shell tool (mitigato dall'astrazione provider — vedi [ADR-0010](0010-provider-aggregation-sdk-openai-compatible.md)).
- **−** Time-to-MVP più lento rispetto ad A-first; trade accettato in cambio del controllo dei differenziatori.
- **Nota ToS:** l'auth via subscription (OAuth) fuori dai client ufficiali può violare i termini del fornitore; la via sanzionata di default è la **chiave API**. La subscription va valutata caso per caso ([06](../06-security-and-permissions.md)).
