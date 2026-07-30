# 00 — Visione e Principi

## Scopo

Definire cosa **è** e cosa **non è** OpenMate, chi ne è l'utente, e i principi di design che vincolano tutte le scelte successive.

## Visione

OpenMate è un **compagno AI personale che vive sul dispositivo dell'utente**. Non è un chatbot che risponde quando interrogato: è un agente **autonomo e persistente** che si sveglia da solo (heartbeat), coltiva una memoria di lungo periodo, agisce sul sistema per conto dell'utente, e col tempo diventa una presenza familiare — l'esperienza a cui puntiamo è quella di un **tamagotchi**: un'entità viva, con continuità, iniziativa e "personalità".

## Utente target

- Un **singolo individuo** (mono-utente) tecnicamente confidente, che vuole un assistente personale che gira in locale.
- Interessato a privacy, controllo e trasparenza: preferisce che memoria e dati restino sul proprio hardware.
- Disposto a concedere all'agente capacità reali (shell, controllo del device) in cambio di autonomia utile.

## Casi d'uso

- Automazioni personali ricorrenti ("ogni mattina prepara il riepilogo di X").
- Assistente che *ricorda* preferenze, progetti, persone e contesto attraverso settimane e mesi.
- Esecuzione di task sul computer che richiedono interazione con applicazioni GUI.
- Presenza proattiva: nota qualcosa e avvisa/agisce senza essere interrogato.

## Goals

- **G1** — Agente autonomo con ciclo cognitivo periodico (heartbeat configurabile).
- **G2** — Memoria di livello cognitivo, trasparente e durevole.
- **G3** — Capacità di agire: shell + controllo del dispositivo via computer-use.
- **G4** — Local-first: funziona con i dati sul dispositivo dell'utente.
- **G5** — Esperienza "viva" (tamagotchi) come layer di interazione (fase successiva).
- **G6** — Estensibile: nuovi tool/skill aggiungibili con attrito minimo.

## Non-goals (esplicitamente fuori scope)

- **NG1** — *Non* è multi-utente né multi-tenant.
- **NG2** — *Non* mira a supportare decine di canali di messaggistica (WhatsApp/Telegram/Slack/…) come OpenClaw. Al più, un canale di interazione alla volta.
- **NG3** — *Non* include sandboxing multi-utente pesante (Docker/SSH backend) per sicurezza tra utenti diversi. La sicurezza è pensata per un singolo proprietario fidato.
- **NG4** — *Non* è un framework cloud/SaaS: nessun deployment server-side obbligatorio.
- **NG5** — *Non* punta (per ora) al pairing di dispositivi mobili come nodi.

> Questi non-goals sono la differenza chiave rispetto a [OpenClaw](https://github.com/openclaw/openclaw): prendiamo la filosofia *daemon locale + tool autonomi + estensibilità*, scartiamo l'infrastruttura pesante multi-canale/multi-utente.

## Principi di design

1. **Local-first.** Il default è che tutto giri e persista in locale. La rete è opzionale e per capacità specifiche (LLM API, embeddings di fallback).
2. **Memoria trasparente.** La conoscenza durevole vive come **markdown leggibile e versionabile**, non come blob opaco. L'utente può ispezionare, correggere e versionare il "cervello" dell'agente.
3. **Agente attivo, non passivo.** L'agente **gestisce da sé** la propria memoria (cosa ricordare, cosa consolidare, cosa dimenticare) e i propri obiettivi. Le memorie non vengono iniettate meccanicamente: l'agente decide quando cercarle. Vedi [ADR-0005](adr/0005-memory-agentic-recall.md).
4. **Sicurezza by-design.** Autonomia + shell + controllo del device sono potenti e pericolosi: ogni azione ad alto impatto passa da permessi, approval gate e audit log. Vedi [06](06-security-and-permissions.md).
5. **Semplicità del substrato.** Preferiamo poche dipendenze embedded (SQLite, file) a stack pesanti. Un utente deve poter capire dove sono i suoi dati.
6. **Estensibilità pulita.** I tool sono componenti con interfaccia uniforme e permessi dichiarati; aggiungerne uno non deve richiedere di toccare il core.

## Rischi e questioni aperte

- **Costo/latenza del computer-use vision** su heartbeat frequenti (vedi [05](05-device-interaction.md)).
- **Crescita illimitata della memoria** e strategie di consolidamento/oblio (vedi [03](03-memory-architecture.md)).
- **Sicurezza dell'autonomia**: quanto può fare l'agente senza chiedere? (vedi [06](06-security-and-permissions.md)).
- **UX del "vivo"**: bilanciare proattività e invadenza (vedi [08](08-ui-tamagotchi.md)).
