<p align="center">
  <img src="assets/banner.png" alt="Remi — by Holyn" width="100%" />
</p>

<h1 align="center">Remi</h1>

<p align="center">
  <strong>A local-first, autonomous personal AI companion that lives on your device.</strong><br />
  Cognitive memory, heartbeat autonomy, and a tamagotchi-like presence — it runs in the background, reasons about its goals, and acts on its own.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/status-alpha-orange.svg" alt="Status: alpha" />
  <img src="https://img.shields.io/badge/node-22-blue.svg" alt="Node 22" />
</p>

---

## What is Remi

Remi is an AI companion that **lives on your device**. It runs as a background daemon, wakes up on a periodic *heartbeat*, reasons about its own goals, and acts autonomously — with a permission and audit layer so you stay in control.

- 🧠 **Cognitive memory** — not a chat history, but a layered brain (core, working, episodic, semantic) stored as a readable markdown *wiki* the agent curates itself.
- 💓 **Heartbeat autonomy** — a periodic cognitive cycle: perceive → recall → plan → act → reflect → consolidate.
- 🖥️ **Computer use** — sees the screen and drives mouse/keyboard to help you inside apps (vision models).
- 🌐 **Browser control** — drives a Playwright session *or* your live Chrome via the Remi extension (with your logins). Works even without a vision model, via DOM snapshots.
- 🐚 **Shell & files** — runs commands and edits files, behind a trust/approval gate with a full audit trail.
- ⏰ **Scheduling** — recurring tasks (cron) and self-scheduled follow-ups.
- 🥚 **Tamagotchi UI** — a companion overlay where the agent is a living presence with moods and its own initiative.

## Model providers

Remi owns its own agent loop and talks to models through a thin provider abstraction:

- **Anthropic** (Claude), **OpenAI**, and any **OpenAI-compatible** endpoint (OpenRouter, Vercel AI Gateway, Ollama, LiteLLM, Groq…).
- 🔑 **Claude subscription login (advanced)** — use your **Claude Pro/Max** plan instead of a metered API key, by reusing an existing **Claude Code** login on your machine. Opt-in mode; see the note below.

> **Note on subscription mode.** This reuses the OAuth token from a local Claude Code login. It is an advanced, personal-use option: using subscription tokens from third-party apps is not officially supported by Anthropic and may stop working at any time. The default remains a standard API key.

## Architecture

Monorepo (pnpm + Turborepo, TypeScript, Node 22). The daemon is the single stateful process; everything else plugs into it.

| Package | Role |
|---|---|
| `packages/core` | Cognitive loop, task store, agent state machine |
| `packages/llm` | Provider abstraction, direct-provider backend, subscription auth |
| `packages/memory` | Layered markdown memory |
| `packages/tools` | Tool registry: shell, files, code, memory, computer-use, browser, scheduling |
| `packages/computer` | Screenshot + input control (macOS / Windows / Linux) |
| `packages/browser` | Playwright control + Chrome extension relay |
| `packages/scheduler` | Heartbeat & cron |
| `packages/daemon` | Wires it all together; HTTP/WebSocket surface |
| `packages/config` | Config schema + secrets resolution |
| `apps/ui` | Electron desktop app (companion overlay, onboarding, settings, dashboard) |
| `apps/cli` | Command-line interface |
| `apps/extension` | Chrome MV3 extension (drive your live Chrome) |
| `apps/evals` | End-to-end evaluation harness (real tokens) |

## Install

Download the latest installer from [**Releases**](https://github.com/renato-milano/remi/releases).

**macOS** — install via Homebrew (opens cleanly; the app is not yet notarized):
```sh
brew tap renato-milano/remi
brew install --cask remi
```
> Prefer the `.dmg` directly? Because the app isn't code-signed yet, macOS Gatekeeper will block it on first open — go to **System Settings → Privacy & Security → Open Anyway**. The Homebrew cask handles this for you.

**Windows** — download `Remi-Setup-<version>.exe` and run it (one-click, per-user, no admin). Unsigned for now, so SmartScreen may warn: **More info → Run anyway**.

**Linux** — download the `.AppImage` (`chmod +x` and run) or the `.deb` (`sudo dpkg -i`). Requires an X11 session for computer-use. Google Chrome must be installed for the browser features.

## Quick start (dev)

Requires **Node 22** and **pnpm**.

```bash
pnpm install
pnpm build

# launch the Electron app (from the repo root)
apps/ui/node_modules/.bin/electron apps/ui
```

On first run, onboarding walks you through choosing a provider (paste an API key, or pick **Claude — Pro/Max subscription** to reuse your Claude Code login) and your autonomy level.

```bash
pnpm test        # run the test suites
pnpm typecheck   # type-check all packages
```

## Status

**Alpha.** The core is working end-to-end: memory, heartbeat autonomy, shell/file/code tools, computer-use, browser control, scheduling, and multi-provider inference including Claude subscription login. Installers for macOS, Windows and Linux are produced by CI (see [Install](#install)); code-signing/notarization is wired but not yet enabled, so the current builds are unsigned.

## Documentation

Architecture docs live under [`docs/`](docs/) (in Italian):

| # | Document |
|---|---|
| 00 | [Vision & Principles](docs/00-vision-and-principles.md) |
| 01 | [Architecture Overview](docs/01-architecture-overview.md) |
| 02 | [Agent Loop & Autonomy](docs/02-agent-loop-and-autonomy.md) |
| 03 | [Memory Architecture](docs/03-memory-architecture.md) |
| 04 | [Tools & Capabilities](docs/04-tools-and-capabilities.md) |
| 05 | [Device Interaction](docs/05-device-interaction.md) |
| 06 | [Security & Permissions](docs/06-security-and-permissions.md) |
| 07 | [Reasoning Backend & Providers](docs/07-llm-provider-abstraction.md) |
| 08 | [Tamagotchi UI](docs/08-ui-tamagotchi.md) |
| 09 | [Tech Stack & Repo Layout](docs/09-tech-stack-and-repo-layout.md) |
| 10 | [Roadmap](docs/10-roadmap.md) |
| 11 | [MVP Implementation Plan](docs/11-mvp-implementation-plan.md) |
| — | [Architecture Decision Records](docs/adr/) |

## Security

Autonomy + shell + device control are gated by a trust policy, per-session approval prompts, and an audit log. Your data and memory stay on your device (local-first). Secrets are kept out of the config file and encrypted at rest.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) · Remi is built by **Holyn**.
