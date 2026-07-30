# 08 — UI Tamagotchi

> ⏳ **Design di dettaglio differito.** Qui fissiamo solo il **contratto d'interfaccia** e i concept, così che il core possa procedere e la UI essere sviluppata indipendentemente in seguito.

## Scopo

Definire l'esperienza d'interazione con l'utente come una **presenza viva** — un tamagotchi — e, soprattutto, il **contratto tecnico** tra il daemon e qualunque client (CLI oggi, UI grafica domani).

## Principio

L'agente non è una finestra di chat: è una **creatura** che vive sul dispositivo, con stati d'animo, continuità e iniziativa. La UI **osserva** e **interagisce** con questa creatura, ma non la contiene: lo stato vive nel daemon ([01](01-architecture-overview.md)).

## Contratto d'interfaccia (questo è ciò che fissiamo ora)

Il **daemon** (`packages/daemon`) espone una **API locale + event stream**. Ogni client (CLI, UI) è "sottile" e:
- **si sottoscrive** allo stream di eventi (stato/mood, azioni, richieste di approvazione);
- **invia** input dell'utente e decisioni di approvazione.

```ts
// Eventi emessi dal daemon verso i client
type AgentEvent =
  | { kind: "state"; state: AgentState }                 // idle/thinking/acting/sleeping/waiting_approval (vedi 02)
  | { kind: "message"; role: "agent"; content: string }  // l'agente comunica
  | { kind: "action"; summary: string }                  // sta facendo qualcosa
  | { kind: "approval_request"; request: ApprovalRequest } // vedi 06
  | { kind: "mood"; mood: Mood };                         // layer espressivo

// Comandi inviati dai client verso il daemon
type ClientCommand =
  | { kind: "user_message"; content: string }
  | { kind: "approval_decision"; approved: boolean; requestId: string }
  | { kind: "interrupt" };                                // kill-switch (vedi 06)
```

Questo contratto è **normativo**: qualunque UI futura vi si conforma. Il resto (estetica, animazioni, piattaforma) è libero.

## Mapping stati → espressione

Gli stati dell'agente ([02](02-agent-loop-and-autonomy.md)) diventano il vocabolario espressivo del tamagotchi:

| Stato agente | Espressione tamagotchi |
|---|---|
| `idle` | riposa, respira, disponibile |
| `thinking` | pensieroso, "..." |
| `acting` | attivo/concentrato (sta usando tool) |
| `sleeping` | dorme e "sogna" (consolidamento memoria, [03](03-memory-architecture.md)) |
| `waiting_approval` | interrogativo, chiede il tuo permesso ([06](06-security-and-permissions.md)) |

## Concept da esplorare (non deciso)

- **Presenza ambientale**: widget/companion sempre presente vs richiamabile.
- **Proattività**: default **moderato** ([ADR-0012](adr/0012-default-proactivity-moderate.md)) — la creatura prende iniziativa solo quando ha qualcosa di utile; resta da progettare *come* la esprime senza essere invadente ([00](00-vision-and-principles.md) principio 3).
- **Personalità visibile**: la `persona` di core memory ([03](03-memory-architecture.md)) riflessa nell'aspetto e nel tono.
- **Feedback delle azioni**: rendere leggibile cosa sta facendo (specie nel computer-use, [05](05-device-interaction.md)).
- **Tecnologia UI**: da valutare a suo tempo (es. app desktop che consuma l'API locale) — vedi [09](09-tech-stack-and-repo-layout.md).

## Rischi e questioni aperte

- Bilanciare **vivacità** e **non-invadenza** (notifiche, iniziativa).
- Comunicare la **latenza** del computer-use senza far sembrare l'agente "bloccato".
- Coerenza tra la personalità espressa dalla UI e quella in core memory.

## Prossimo passo

Il design di dettaglio verrà affrontato dopo l'MVP ([10](10-roadmap.md)). Fino ad allora, il client di riferimento è la **CLI**, che implementa lo stesso contratto d'interfaccia.
