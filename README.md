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

## Installation

Grab the latest installer for your OS from the [**Releases**](https://github.com/renato-milano/remi/releases) page.

### Requirements

- **A model provider** — either an API key (Anthropic, OpenAI, or any OpenAI-compatible endpoint) **or** a **Claude Pro/Max subscription** (Remi reuses a local [Claude Code](https://claude.com/claude-code) login — no API key needed). You set this up on first run.
- **Google Chrome** — required only for the browser features.
- **OS**: macOS 12+, Windows 10/11, or Linux with an **X11** session (computer-use isn't supported on Wayland).

> The current builds are **unsigned** (code-signing/notarization is wired but not yet enabled), so each OS shows a first-launch warning. The steps below get you past it.

### macOS

**Recommended — Homebrew** (handles the Gatekeeper warning for you):
```sh
brew tap renato-milano/remi
brew install --cask remi
```

**Or the `.dmg` directly** — download `Remi-<version>-arm64.dmg` (Apple Silicon) or `Remi-<version>-x64.dmg` (Intel), open it, and drag **Remi** into **Applications**. On first launch macOS will say the app "cannot be opened" — this is expected for an unsigned app:
1. Open **System Settings → Privacy & Security**.
2. Scroll to the security notice about Remi and click **Open Anyway**.
3. Confirm once more. Subsequent launches open normally.

**Permissions for computer-use** (optional feature). If you enable "let Remi see the screen and use mouse/keyboard", macOS will ask for:
- **Screen Recording** — System Settings → Privacy & Security → Screen Recording → enable **Remi**.
- **Accessibility** — System Settings → Privacy & Security → Accessibility → enable **Remi**.

Remi prompts for these when needed; you can also grant them upfront in Settings. A restart of Remi may be required after granting.

### Windows

Download `Remi-Setup-<version>.exe` and run it — it's a **one-click, per-user** install (no admin rights). Because it's unsigned, **SmartScreen** may warn: click **More info → Run anyway**. Remi then appears in the Start menu and on the desktop.

### Linux

Download either:
- **AppImage** — `chmod +x Remi-<version>.AppImage` then run it.
- **.deb** (Debian/Ubuntu) — `sudo dpkg -i remi_<version>_amd64.deb`.

Requires an **X11** session for computer-use. Install **Google Chrome** for the browser features.

### First run

Onboarding walks you through:
1. **Naming** your companion and picking a tone.
2. **Connecting the brain** — paste an API key, or choose **"Claude — Pro/Max subscription"** to reuse your Claude Code login.
3. **Autonomy** — how often Remi wakes on its own, and how much it can do without asking.
4. **Optional** computer-use and browser control.

After setup, Remi lives as a companion overlay. Summon it any time with **⌘⇧O** (macOS) / **Ctrl+Shift+O** (Windows/Linux) or by hovering it. **Right-click** the companion for the menu (Sleep, Interrupt, Dashboard, Settings, Quit).

Your data, memory, and (encrypted) keys stay on your device under the OS app-data folder (e.g. `~/Library/Application Support/Remi` on macOS).

### Updating

- **Homebrew**: `brew upgrade --cask remi`.
- **Direct download / Windows / Linux**: grab the newer installer from Releases and reinstall over the top.

### Uninstalling

- **macOS (Homebrew)**: `brew uninstall --cask remi` (add `--zap` to also remove app data).
- **macOS (manual)**: drag **Remi** from Applications to the Trash; delete `~/Library/Application Support/Remi` to remove data.
- **Windows**: Settings → Apps → Remi → Uninstall.
- **Linux**: delete the AppImage, or `sudo apt remove remi`.

### Troubleshooting

- **macOS "Remi is damaged and can't be opened"** — an over-eager Gatekeeper state on unsigned apps. Install via Homebrew, or run once: `xattr -dr com.apple.quarantine /Applications/Remi.app`.
- **Remi opens but nothing happens / "LLM cycles will fail"** — no provider configured: open **Settings** and add an API key or enable the Claude subscription.
- **Browser features do nothing** — Google Chrome isn't installed, or (Linux) you're on Wayland instead of X11.
- **Computer-use does nothing on macOS** — Screen Recording and/or Accessibility not granted to Remi (see Permissions above); grant them and restart Remi.

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
