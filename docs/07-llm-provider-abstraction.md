# 07 — Reasoning Backend e Astrazione Provider

## Scopo

Definire come OpenMate ragiona: l'astrazione del **cervello** (`ReasoningBackend`) e, sotto di essa, come parliamo ai modelli senza cablare ogni libreria provider. Obiettivo: controllo del loop + libertà di scelta del modello + local-first.

## Decisioni

- **OpenMate possiede il proprio cognitive loop (B-first)** ([ADR-0009](adr/0009-reasoning-backend-own-loop.md)). Il ragionamento passa da un'interfaccia **`ReasoningBackend`**; il default è **`DirectProviderBackend`** (chiama direttamente gli endpoint dei modelli). Un **`LocalAgentBackend`** (adapter verso coding agent locali, stile paperclip) è previsto come backend *pluggable* futuro ([10](10-roadmap.md)).
- **Aggregazione provider: astrazione SDK in-process + OpenAI-compatible** ([ADR-0010](adr/0010-provider-aggregation-sdk-openai-compatible.md)). Nessun aggregatore hosted come default.
- **Default Claude, vision obbligatoria.** Il computer-use ([05](05-device-interaction.md)) richiede un modello vision-capable; il provider di default deve supportarlo.

## Il ReasoningBackend

È il confine tra il `core` ([02](02-agent-loop-and-autonomy.md)) e "come si pensa":

```ts
interface ReasoningBackend {
  id: string;                                  // "direct-provider" | "local-agent"
  run(input: ReasoningInput): AsyncIterable<ReasoningEvent>;
  capabilities: { vision: boolean; toolUse: boolean; streaming: boolean };
}
```

- **`DirectProviderBackend`** (MVP) — esegue il loop di OpenMate chiamando un `Provider` (sotto). Integra nativamente memoria ([03](03-memory-architecture.md)) e computer-use ([05](05-device-interaction.md)).
- **`LocalAgentBackend`** (futuro) — delega a un agente locale (Claude Code/Codex/…), a cui esponiamo `memory.*` e `computer.*` come tool via **MCP**. Vedi [ADR-0009](adr/0009-reasoning-backend-own-loop.md).

## Il layer Provider (dentro DirectProviderBackend)

`packages/llm` espone un'interfaccia `Provider` con due meccanismi di integrazione ([ADR-0010](adr/0010-provider-aggregation-sdk-openai-compatible.md)):

1. **Astrazione SDK in-process (default)** — libreria TS-native (candidata: **Vercel AI SDK**) che unifica chat, tool-use, vision e streaming. Nessun servizio esterno.
2. **Endpoint OpenAI-compatible via base URL** — escape hatch che copre con un solo adattatore **Ollama** locale, **LiteLLM** self-hosted e aggregatori hosted (**OpenRouter**) come *opt-in*.

## Capacità richieste dall'interfaccia

- **Chat/completion** multi-turn.
- **Tool-use** (function calling): schemi dal registry ([04](04-tools-and-capabilities.md)) → chiamate strutturate.
- **Vision**: input immagine (screenshot) per il computer-use ([05](05-device-interaction.md)).
- **Streaming**: token incrementali per la reattività della UI ([08](08-ui-tamagotchi.md)).
- **Capability detection**: sapere se provider/modello supporta vision/tool-use/streaming — indispensabile perché **le astrazioni perdono colpi proprio su tool-use e vision**, e alcuni provider (molti locali) non hanno vision affidabile.

## Interfaccia Provider (bozza, non normativa)

```ts
interface Provider {
  id: string;                          // "anthropic" | "openai" | "openai-compatible" | ...
  capabilities: { vision: boolean; toolUse: boolean; streaming: boolean };
  chat(req: ChatRequest): AsyncIterable<ChatChunk>;   // streaming
}

interface ChatRequest {
  model: string;
  messages: Message[];                 // testo + eventuali immagini
  tools?: ToolSchema[];                // dal registry
  system?: string;                     // core memory + persona iniettate qui
  maxTokens?: number;
}
```

## Selezione, auth e fallback

- **Default configurabile** in `packages/config` ([09](09-tech-stack-and-repo-layout.md)): provider + modello.
- **Auth pluggable**: **chiave API di default** (via sanzionata); subscription/OAuth dove lecito — attenzione ai ToS dei fornitori ([ADR-0009](adr/0009-reasoning-backend-own-loop.md), [06](06-security-and-permissions.md)).
- **Requisiti per compito**: un task di computer-use richiede `capabilities.vision === true`; il layer instrada/rifiuta di conseguenza.
- **Fallback**: possibilità di degradare verso un altro provider/modello su errore o indisponibilità.
- **Chiavi API** gestite da `packages/config`, mai in chiaro nell'audit ([06](06-security-and-permissions.md)).

## Rischi e questioni aperte

- **Leak delle astrazioni** su tool-use/vision: servono shim per-provider per le divergenze; il computer-use vision è il punto più delicato.
- **Costi**: cicli autonomi + vision accumulano spesa → budget/limiti ([02](02-agent-loop-and-autonomy.md), [06](06-security-and-permissions.md)).
- **Idoneità dei modelli locali** al computer-use (vision spesso assente/inaffidabile).
- **Evoluzione della libreria di astrazione** (es. Vercel AI SDK) — incapsulata dietro `Provider` per limitarne l'impatto.
