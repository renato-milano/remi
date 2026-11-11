<p align="center">
  <img src="assets/banner.png" alt="Remi — by Holyn" width="100%" />
</p>

<h1 align="center">Remi</h1>

<p align="center">
  <strong>Point at anything on your screen and ask. Remi explains it out loud — drawing on a whiteboard or building a 3D model while it talks.</strong><br />
  A local-first AI companion that lives on your device, sees what you see, and teaches you about it.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/status-alpha-orange.svg" alt="Status: alpha" />
  <img src="https://img.shields.io/badge/node-22-blue.svg" alt="Node 22" />
</p>

---

## What is Remi

Remi stays out of the way until you need it. **Hold one key, point with the mouse and ask your question out loud** — about a diagram, a piece of code, a chart, an engine part, an app you don't know. Remi looks at what's under your cursor and answers by voice, showing you as it speaks.

- 👉 **Point & ask** — hold the key (right **Option** on macOS, right **Ctrl** on Windows/Linux) and talk; hold and drag to circle an area. Or just say **"Hey Remi"** while you point. A quick tap opens a box to type instead.
- 🗣️ **Talks back** — spoken answers with natural voices; your question is transcribed locally (whisper.cpp) or in the cloud. Your Mac's volume dips while Remi listens.
- ✍️ **Live whiteboard** — for "how does it work?" questions Remi draws the explanation step by step, hand-drawn, in sync with what it's saying — and circles the matching spots on your actual screen.
- 🧊 **3D models in real time** — ask to *see* something and Remi builds an interactive 3D model while it explains: real colours, cutaways to show the inside, hover/click on a part for its explanation. Animated scenes (a drone taking off, a curled free kick) come with a playback bar: pause, slow motion, contact markers, motion trails.
- 📓 **Notebook** — every whiteboard, 3D model and answer is saved by topic, so you can reopen it, listen again or follow up later (⌘⇧Y / Ctrl+Shift+Y, or the menu-bar icon).
- 🖥️ **It can also do things** — computer use (mouse/keyboard), your browser (Playwright or your live Chrome via the extension), shell & files behind a trust/approval gate, scheduled tasks, and a layered memory it curates itself.

> Point & ask, the whiteboard and 3D need a **vision model**. We use Google Gemini Flash through the Vercel AI Gateway; Claude and GPT models work too.

## Model providers

Remi owns its own agent loop and talks to models through a thin provider abstraction:

- **Anthropic** (Claude), **OpenAI**, and any **OpenAI-compatible** endpoint (OpenRouter, Vercel AI Gateway, Ollama, LiteLLM, Groq…).
- 🔑 **Claude subscription login (advanced)** — use your **Claude Pro/Max** plan instead of a metered API key, by reusing an existing **Claude Code** login on your machine. Opt-in mode; see the note below.

> **Note on subscription mode.** This reuses the OAuth token from a local Claude Code login. It is an advanced, personal-use option: using subscription tokens from third-party apps is not officially supported by Anthropic and may stop working at any time. The default remains a standard API key.

## Architecture

Monorepo (pnpm + Turborepo, TypeScript, Node 22). The daemon is the single stateful process; everything else plugs into it.

| Package | Role |
|---|---|
| `packages/core` | Agent loop, task store, whiteboard stream parser, agent state machine |
| `packages/llm` | Provider abstraction, direct-provider backend, subscription auth |
| `packages/memory` | Layered markdown memory |
| `packages/tools` | Tool registry: shell, files, code, memory, computer-use, browser, scheduling |
| `packages/computer` | Screenshot + input control (macOS / Windows / Linux) |
| `packages/browser` | Playwright control + Chrome extension relay |
| `packages/scene3d` | 3D scene language: prompt guide, validation, streaming parser, animation & contact checks |
| `packages/voice` | Speech: local whisper.cpp transcription, cloud transcription and text-to-speech |
| `packages/scheduler` | Heartbeat & cron |
| `packages/daemon` | Wires it all together; HTTP/WebSocket surface |
| `packages/config` | Config schema + secrets resolution |
| `apps/ui` | Electron desktop app (point & ask, whiteboard, 3D viewer, notebook, companion, settings) |
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

**Download the `.dmg`** — `Remi-mac-arm64.dmg` (Apple Silicon) or `Remi-mac-x64.dmg` (Intel), open it, and drag **Remi** into **Applications**. On first launch macOS will say the app "cannot be opened" — this is expected for an unsigned app:
1. Open **System Settings → Privacy & Security**.
2. Scroll to the security notice about Remi and click **Open Anyway**.
3. Confirm once more. Subsequent launches open normally.

**Alternatively — Homebrew** (for terminal users). The cask strips the quarantine so it opens without the step above, but it runs a command, so Homebrew asks you to trust the tap first:
```sh
brew tap renato-milano/remi
brew trust --cask renato-milano/remi/remi
brew install --cask remi
```

**Permissions.** To see your screen, hear you and react to the point key (and, optionally, drive mouse/keyboard), macOS will ask for:
- **Screen Recording** — System Settings → Privacy & Security → Screen Recording → enable **Remi**.
- **Accessibility** — System Settings → Privacy & Security → Accessibility → enable **Remi**.
- **Microphone** — asked the first time you talk to Remi.

Remi prompts for these when needed; you can also grant them upfront in Settings. A restart of Remi may be required after granting.

### Windows

Download `Remi-win-x64.exe` and run it — it's a **one-click, per-user** install (no admin rights). Because it's unsigned, **SmartScreen** may warn: click **More info → Run anyway**. Remi then appears in the Start menu and on the desktop.

### Linux

Download either:
- **AppImage** — `chmod +x Remi-linux.AppImage` then run it.
- **.deb** (Debian/Ubuntu) — `sudo dpkg -i Remi-linux.deb`.

Requires an **X11** session for computer-use. Install **Google Chrome** for the browser features.

### Browser extension (optional)

Only needed for the **"live Chrome" browser mode** (drive your real Chrome with your logins). The autonomous browser mode needs nothing. It isn't on the Chrome Web Store yet, so install it unpacked:

1. Download **`remi-chrome-extension.zip`** from the [latest release](https://github.com/renato-milano/remi/releases/latest/download/remi-chrome-extension.zip) and unzip it (keep the folder somewhere permanent).
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the unzipped **`Remi Browser Extension`** folder.
4. In Remi → Settings → Browser control, choose **Extension (live Chrome)** mode. Click the extension icon on the tab you want Remi to drive.

> Chrome keeps developer-mode extensions and shows a "…is being debugged" banner while active — that's normal (`chrome.debugger`). A one-click Web Store version is planned.

### First run

Onboarding walks you through:
1. **Naming** your companion and picking a tone.
2. **Connecting the brain** — paste an API key, or choose **"Claude — Pro/Max subscription"** to reuse your Claude Code login.
3. **Autonomy** — how often Remi wakes on its own, and how much it can do without asking.
4. **Optional** voice, computer-use and browser control.

After setup Remi stays hidden. To use it:

| | macOS | Windows / Linux |
|---|---|---|
| Point & ask by voice | hold **right Option**, point, talk, release | hold **right Ctrl** |
| Circle an area | hold the key and drag | same |
| Type a question | tap the key | same |
| Hands-free | say **"Hey Remi"** (enable in Settings → Voice) | same |
| Show / hide the companion | double-tap the key, or **⌘⇧O** | double-tap, or **Ctrl+Shift+O** |
| Notebook | **⌘⇧Y** or the menu-bar icon | **Ctrl+Shift+Y** or the tray icon |

Point & ask needs the **Accessibility** permission for the key (without it Remi falls back to **Ctrl+Option+Space**), **Screen Recording** to see the screen and the **Microphone** for voice. **Right-click** the companion for the menu (Sleep, Interrupt, Notebook, Dashboard, Settings, Quit).

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
- **Point & ask does nothing / only text answers** — the model has no vision (e.g. DeepSeek chat): pick a vision model in Settings.
- **Computer-use or point & ask does nothing on macOS** — Screen Recording and/or Accessibility not granted to Remi (see Permissions above); grant them and restart Remi.

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

**Alpha.** Working end-to-end: point & ask with voice and "Hey Remi", the live whiteboard, real-time 3D models and animated scenes, the notebook, plus memory, heartbeat autonomy, shell/file/code tools, computer-use, browser control, scheduling, and multi-provider inference including Claude subscription login. Installers for macOS, Windows and Linux are produced by CI (see [Installation](#installation)); code-signing/notarization is wired but not yet enabled, so the current builds are unsigned.

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
| 12 | [Packaging & Distribution](docs/12-packaging-and-distribution.md) |
| — | [Architecture Decision Records](docs/adr/) |

## Security

Autonomy + shell + device control are gated by a trust policy, per-session approval prompts, and an audit log. Your data and memory stay on your device (local-first). Secrets are kept out of the config file and encrypted at rest.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE) · Remi is built by **Holyn**.
