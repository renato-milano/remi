# 06 — Sicurezza e Permessi

## Scopo

Un agente **autonomo** con accesso alla **shell** e al **controllo del dispositivo** è potente e pericoloso. Questo documento definisce il modello di fiducia, i livelli di permesso, gli approval gate, l'audit e i meccanismi di sicurezza che rendono l'autonomia accettabile.

## Modello di fiducia

OpenMate è **mono-utente e local-first** ([00](00-vision-and-principles.md)): l'utente è il **proprietario fidato** della macchina. Non difendiamo da altri utenti sulla stessa istanza (niente sandbox multi-utente Docker/SSH — è un [non-goal](00-vision-and-principles.md#non-goals-esplicitamente-fuori-scope)). Ciò da cui **difendiamo** è:

- azioni **autonome indesiderate** dell'agente (errori, allucinazioni, loop);
- azioni **irreversibili o ad alto impatto** eseguite senza consapevolezza dell'utente;
- **esfiltrazione involontaria** di dati verso servizi esterni.

## Livelli di permesso dei tool

Ogni tool dichiara un livello ([04](04-tools-and-capabilities.md)):

| Livello | Significato | Comportamento default |
|---|---|---|
| **`safe`** | Nessun effetto collaterale rilevante (es. `computer.screenshot`, `memory.search`). | Eseguito senza chiedere. |
| **`guarded`** | Effetti reversibili o limitati (es. `file.write` in workspace, `shell.run` allowlisted). | Eseguito secondo policy; loggato. |
| **`dangerous`** | Effetti potenzialmente irreversibili (input GUI, comandi di sistema, invii, pagamenti). | **Approval gate** salvo regola esplicita. |

## Approval gate

Quando un'azione supera la soglia di rischio, l'agente entra nello stato `waiting_approval` ([02](02-agent-loop-and-autonomy.md)) ed emette una **richiesta di approvazione** sull'event stream:

```ts
interface ApprovalRequest {
  toolName: string;
  summary: string;          // cosa sta per fare, in chiaro
  details: unknown;         // parametri (es. comando, coordinate)
  risk: "guarded" | "dangerous";
}
```

L'utente approva/rifiuta via CLI o UI ([08](08-ui-tamagotchi.md)). Le decisioni possono generare **regole** (es. "consenti sempre `git status`") per ridurre l'attrito senza abbassare la sicurezza in modo indiscriminato.

## Policy di autonomia

Un file di configurazione ([09](09-tech-stack-and-repo-layout.md)) definisce **cosa l'agente può fare senza chiedere**:
- **allowlist/denylist** per `shell.run` (pattern di comandi);
- percorsi filesystem consentiti per i tool `file.*`;
- categorie di azioni GUI che richiedono sempre conferma;
- limiti operativi: max step per ciclo, budget di token/tempo, rate limit dei tool (anti loop-runaway, [02](02-agent-loop-and-autonomy.md)).

**Granularità (deciso):** i permessi sono **per-tool** di base, **più matcher per-parametro** dove serve — pattern di comandi per `shell.run`, glob di percorsi per `file.*`. Così "consenti `git status`" o "consenti scrittura in `~/openmate`" sono regole esprimibili senza aprire l'intero tool.

**Difesa da prompt injection (deciso):** i contenuti letti dall'agente (schermo, file, web) sono marcati con **provenance tag** come *dati non fidati* — mai eseguiti come istruzioni. Combinato con privilegi minimi e approval sui `dangerous`, riduce il rischio che un contenuto ostile induca azioni dannose.

## Audit log

Registro **append-only** di ogni azione con effetto:

```sql
CREATE TABLE audit (
  id        INTEGER PRIMARY KEY,
  ts        TEXT NOT NULL,
  tool      TEXT NOT NULL,
  input     TEXT NOT NULL,     -- parametri (redatti se sensibili)
  decision  TEXT NOT NULL,     -- auto | approved | denied
  outcome   TEXT,              -- ok | error + estratto
  agent_state TEXT
);
```

Serve per accountability, debugging e per ricostruire "cosa ha fatto l'agente e perché".

## Kill-switch

L'utente può **interrompere immediatamente** qualunque attività: un `AbortSignal` propagato ai tool ([04](04-tools-and-capabilities.md)) ferma shell e loop di computer-use in corso. Uno stop "hard" mette l'agente in `idle` e sospende gli heartbeat finché non riprende.

## Gestione di segreti e dati

- **Chiavi API** (LLM, embeddings di fallback) gestite da `packages/config`, mai loggate in chiaro nell'audit.
- **Confini di rete**: il default è local-first; ogni uscita di dati (API LLM, embeddings API) è esplicita e configurabile. L'embedding locale è preferito anche per non far uscire i contenuti della memoria ([03](03-memory-architecture.md), [ADR-0006](adr/0006-embeddings-local-with-api-fallback.md)).
- **Redazione**: screenshot e input possono contenere dati sensibili; l'audit deve poterli redigere/omettere ([05](05-device-interaction.md)).

## Rischi e questioni aperte

- **Prompt injection (rischio residuo):** il provenance tagging riduce ma non azzera il rischio; contenuti ostili sofisticati restano una minaccia da monitorare.
- **Escalation graduale**: regole "consenti sempre" troppo larghe erodono la sicurezza; serve revisione periodica.
- **Fatigue da approvazioni**: troppe richieste spingono l'utente ad approvare a occhi chiusi; bilanciare con policy sensate.
- **Integrità dell'audit**: dove risiede e come si protegge da manomissioni.
