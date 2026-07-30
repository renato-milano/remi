# 04 — Tool e Capacità

## Scopo

Definire come l'agente **tocca il mondo**. Tutte le capacità (shell, controllo device, memoria, file) passano da un'unica astrazione: il **tool**, con schema, permessi e discovery uniformi. Nessuna capacità vive nascosta nel core.

## Modello del tool

Un tool è un componente con:
- **Nome** univoco (namespaced: `shell.run`, `computer.click`, `memory.search`).
- **Schema** dei parametri (JSON Schema) e del risultato — è ciò che viene esposto all'LLM per il tool-use.
- **Livello di permesso** dichiarato (vedi [06](06-security-and-permissions.md)): `safe` / `guarded` / `dangerous`.
- **Handler** che esegue l'azione.

```ts
interface Tool<I = unknown, O = unknown> {
  name: string;                    // es. "shell.run"
  description: string;             // per il modello
  parameters: JSONSchema;          // input schema
  permission: "safe" | "guarded" | "dangerous";
  execute(input: I, ctx: ToolContext): Promise<O>;
}
```

## Registry e discovery

- Un **registry** centrale raccoglie i tool disponibili e ne espone gli schemi al layer LLM ([07](07-llm-provider-abstraction.md)) per il tool-use.
- I tool sono **scopribili** per capability, così l'agente sa cosa può fare.
- Aggiungere un tool = registrare un `Tool`; non richiede modifiche al `core`. Questo è il meccanismo di estensibilità (**skills**).

## Tool core (MVP e oltre)

| Tool | Permesso | Descrizione | Doc |
|---|---|---|---|
| `shell.run` | guarded/dangerous | Esegue un comando shell come subprocess, con allowlist/denylist e approval. | qui sotto |
| `computer.screenshot` | safe | Cattura lo schermo per il computer-use vision. | [05](05-device-interaction.md) |
| `computer.click` / `computer.type` / `computer.scroll` | dangerous | Muove mouse/tastiera per interagire con la GUI. | [05](05-device-interaction.md) |
| `memory.search` / `read` / `write` / `link` / `log` / `core.edit` | safe/guarded | Recall e gestione della memoria. | [03](03-memory-architecture.md) |
| `file.read` / `file.write` / `file.list` | guarded | Accesso al filesystem entro percorsi consentiti. | qui sotto |
| `browser.*` *(futuro/opzionale)* | guarded | Navigazione web programmatica. | roadmap [10](10-roadmap.md) |

### Shell tool
Superficie d'esecuzione primaria per task non-GUI. Modello: **subprocess** con layer di permessi + audit ([ADR-0008](adr/0008-shell-permission-model.md)), *non* sandbox Docker (fuori scope, [00](00-vision-and-principles.md#non-goals-esplicitamente-fuori-scope)):
- **allowlist/denylist** di comandi/pattern;
- comandi ad alto impatto → **approval gate** ([06](06-security-and-permissions.md));
- ogni esecuzione registrata nell'**audit log**;
- timeout, limiti di output, working directory controllata.

### File tool
Lettura/scrittura entro **percorsi consentiti** (es. workspace dell'agente, cartella `memory/`). Fuori da lì → `guarded` con approval.

## Estensibilità (skills)

Una **skill** è un pacchetto che estende l'agente con conoscenza procedurale + eventuali script/tool. Requisiti:
- dichiara i permessi richiesti in modo esplicito;
- non bypassa il registry né il layer di permessi;
- versionabile e disinstallabile senza toccare il core.

### Formato: `SKILL.md`

Adottiamo il formato **`SKILL.md`** (già standard in agenti come Claude/opencode; usato da [OpenWork](https://github.com/different-ai/openwork) come *prior art*): una cartella per skill con un file markdown a frontmatter, più eventuali script.

```
skills/
  <nome-skill>/
    SKILL.md            # frontmatter + istruzioni
    scripts/*.mjs       # opzionale: script eseguibili dalla skill
```

```markdown
---
name: nome-skill
description: Cosa fa. Use when ... (trigger per far scegliere la skill all'agente)
---

# Nome Skill
## Cosa fa
...
## Come si usa
...
```

Il campo `description` con i trigger "Use when…" è ciò che permette all'agente di **scoprire e selezionare** la skill pertinente (discovery, sotto). Una skill può registrare tool nel registry e/o fornire solo istruzioni procedurali.

Un eventuale registry pubblico di skill è materiale da roadmap ([10](10-roadmap.md)), non MVP.

## Interoperabilità MCP

Il **Model Context Protocol (MCP)** è il confine di interoperabilità di OpenMate, in due direzioni:

- **OpenMate come server MCP** — espone le proprie capacità (tool `memory.*`, `computer.*`, `shell.*`, skill) a agenti esterni. Seguiamo il pattern a **due verbi** che OpenWork usa a scala (`search_capabilities` / `execute_capability`): un verbo per *scoprire* le capacità disponibili, uno per *eseguirle*. Vantaggio: un registry grande resta gestibile per il modello esterno senza gonfiare il contesto con tutti gli schemi. È così che il futuro **`LocalAgentBackend`** (es. Claude Code/opencode) userà memoria e computer-use di OpenMate ([ADR-0009](adr/0009-reasoning-backend-own-loop.md)).
- **OpenMate come client MCP** — consuma capability/skill esterne (server MCP di terzi) come tool aggiuntivi nel registry, con gli stessi permessi e audit dei tool nativi ([06](06-security-and-permissions.md)).

I permessi e l'audit si applicano **identici** che la capacità sia nativa, da skill o via MCP: nessuna scorciatoia che aggiri il layer di sicurezza.

## Contesto di esecuzione

```ts
interface ToolContext {
  agentState: AgentState;          // stato corrente (vedi 02)
  requestApproval(req: ApprovalRequest): Promise<boolean>;  // vedi 06
  audit(entry: AuditEntry): void;  // vedi 06
  signal: AbortSignal;             // per kill-switch / timeout
}
```

## Rischi e questioni aperte

- **Granularità dei permessi:** per-tool basta o serve per-parametro (es. `shell.run` con comando specifico)?
- **Composizione di tool** in azioni multi-step atomiche.
- **Framework: deciso** — registry e tool-use su misura; la libreria di astrazione provider copre solo il layer LLM ([ADR-0009](adr/0009-reasoning-backend-own-loop.md), [ADR-0010](adr/0010-provider-aggregation-sdk-openai-compatible.md)). L'esposizione via **MCP** è definita nella sezione *Interoperabilità MCP* sopra.
- **Schema esatto delle capability MCP** (mapping tool nativi → verbi `search`/`execute`) e granularità della discovery — da dettagliare in fase di implementazione.
