# OpenMate 🥚

> Un agente AI personale, **local-first**, autonomo e "vivo" — con una gestione della memoria di livello cognitivo e un'esperienza d'uso simil-**tamagotchi**.

**Stato:** 📄 *Documentazione fondativa (pre-alpha)* — non c'è ancora codice. Questa fase serve a validare le scelte architetturali che guideranno lo sviluppo.

---

## Cos'è OpenMate

OpenMate è un compagno AI che **vive sul tuo dispositivo**. Gira come un daemon in background, si sveglia a intervalli periodici (*heartbeat*), ragiona sui propri obiettivi, e agisce autonomamente:

- 🧠 **Memoria cognitiva** — non un semplice storico chat, ma un cervello a livelli (core, working, episodic, semantic) con una *wiki* leggibile che l'agente cura da solo.
- 💓 **Autonomia con heartbeat** — un ciclo cognitivo periodico: percepisce → recupera → pianifica → agisce → riflette → consolida.
- 🖥️ **Controllo del dispositivo** — interagisce con il sistema tramite *computer-use* (vede lo schermo e usa mouse/tastiera).
- 🐚 **Accesso alla shell** — esegue comandi, con un layer di permessi e audit.
- 🥚 **Esperienza tamagotchi** *(in arrivo)* — una UI in cui l'agente è una presenza viva, con stati d'animo e iniziativa propria.

## Filosofia

OpenMate si ispira all'obiettivo core di [OpenClaw](https://github.com/openclaw/openclaw) — un agente personale local-first con daemon, tool autonomi ed estensibilità — ma **rinuncia deliberatamente all'infrastruttura pesante** (decine di canali di messaggistica, sandboxing multi-utente Docker/SSH, pairing di dispositivi mobili). OpenMate è **mono-utente, personale, e memory-centric**.

## Principi

1. **Local-first** — i tuoi dati e la tua memoria restano sul tuo dispositivo.
2. **Memoria trasparente** — la conoscenza durevole è markdown leggibile e versionabile, non un DB opaco.
3. **Agente attivo, non passivo** — gestisce da sé cosa ricordare, cosa dimenticare, cosa fare.
4. **Sicurezza by-design** — autonomia + shell + controllo device richiedono permessi, approval gate e audit.

## Documentazione

| # | Documento | Contenuto |
|---|---|---|
| 00 | [Visione e Principi](docs/00-vision-and-principles.md) | Cosa è e cosa non è OpenMate |
| 01 | [Panoramica Architetturale](docs/01-architecture-overview.md) | Componenti, data-flow, monorepo |
| 02 | [Loop dell'Agente e Autonomia](docs/02-agent-loop-and-autonomy.md) | Cognitive cycle, heartbeat |
| 03 | [Architettura della Memoria](docs/03-memory-architecture.md) | **Documento cardine** |
| 04 | [Tool e Capacità](docs/04-tools-and-capabilities.md) | Registry, shell, computer-use |
| 05 | [Interazione col Dispositivo](docs/05-device-interaction.md) | Computer-use vision |
| 06 | [Sicurezza e Permessi](docs/06-security-and-permissions.md) | Trust, approval, audit |
| 07 | [Reasoning Backend e Provider](docs/07-llm-provider-abstraction.md) | OpenMate possiede il loop; multi-provider, default Claude |
| 08 | [UI Tamagotchi](docs/08-ui-tamagotchi.md) | Contratto d'interfaccia (design futuro) |
| 09 | [Stack e Layout Repo](docs/09-tech-stack-and-repo-layout.md) | TS/Node, pnpm, package |
| 10 | [Roadmap](docs/10-roadmap.md) | Fasi di sviluppo, MVP |
| 11 | [Piano di Implementazione MVP](docs/11-mvp-implementation-plan.md) | Task, milestone, contratti, test |
| — | [Architecture Decision Records](docs/adr/) | Le decisioni chiave tracciate |

## Contribuire

Vedi [CONTRIBUTING.md](CONTRIBUTING.md). In questa fase il contributo più utile è **feedback sulla documentazione architetturale**.

## Licenza

[MIT](LICENSE).
