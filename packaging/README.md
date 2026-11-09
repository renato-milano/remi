# Remi installation and releases

Remi packages its Electron runtime and daemon. End users don't need Node.js,
pnpm, Git, or a compiler. Installers target macOS Intel and Apple Silicon and
Windows x64. Linux builds are also configured.

## Install Remi

Download the installer for your system from the
[releases page](https://github.com/renato-milano/remi/releases).
On macOS, open the DMG and drag Remi to Applications. On Windows, run the EXE;
the installer creates shortcuts for your user without requiring administrator
access. Launch Remi and choose your provider, model, and API key.

Provider accounts and API usage aren't included. The wizard validates required
fields, but doesn't test a live model request or account credit. Ollama requires
its own installation, a running server, and a downloaded model. The advanced
Claude Code option requires an existing supported login.

## Included and optional components

The installer includes these components:

- Electron, with the Node runtime used to launch the bundled daemon.
- Production dependencies, including SQLite, nut-js, Playwright Core, and
  uiohook, with native modules rebuilt for Electron.
- The bundled Three.js viewer and local application assets.
- The whisper.cpp server and its license. Model weights aren't included.
- The browser extension under the installed resources/browser-extension folder.
- The Remi license.

Enable local voice in Settings and download a voice model before using it.
Browser automation currently requires installed Google Chrome; Playwright Core
isn't a browser distribution. The extension is optional and requires manual
loading in Chrome. Computer control is optional; macOS requires Screen Recording
and Accessibility permissions. Voice also requires microphone access.

## Run from source

Install Node.js 22 and pnpm 11.5.0, then run:

```sh
git clone https://github.com/renato-milano/remi.git
cd remi
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @openmate/ui start
```

Native dependencies can require Python and C++ build tools if prebuilt binaries
aren't available: Xcode Command Line Tools on macOS or Visual Studio Build Tools
with the C++ workload on Windows. Local voice additionally requires Git, CMake,
a C++ compiler, and Bash to run `bash packaging/build-whisper.sh`.
On Windows, use Git Bash for that build command.

## Build installers

Build on the target operating system. Use a disposable checkout because
Electron's native dependency rebuild can make the checkout unsuitable for
running tests with the system Node runtime.

```sh
pnpm install --frozen-lockfile
pnpm --filter @openmate/ui dist:mac
# On Windows:
pnpm --filter @openmate/ui dist:win
```

These commands compile the workspace, daemon, 3D viewer, and Whisper server
before packaging. They require the voice build tools listed above. Artifacts
are written to `apps/ui/dist`. Build macOS architectures separately when testing
locally; the CI builds a universal Whisper binary for both macOS installers.
The `dist` command builds for the host platform.

## Release verification

The release workflow runs for `v*` tags and checks that the tag matches the UI
package version. It builds and publishes installers and the extension archive.
Don't tag a public release until the following checks pass:

1. Install on clean Windows x64, macOS arm64, and macOS x64 machines without
   development tools. Confirm the daemon starts and SQLite persists data.
2. Complete onboarding, send a real model request, restart, and verify settings.
3. Test the 3D viewer, optional Chrome integration, computer permissions, and
   voice model download and transcription.
4. Verify names and icons in the Dock, taskbar, shortcuts, and uninstaller.
5. Test upgrade and uninstall behavior without losing user data unexpectedly.
6. Review third-party licenses for every shipped runtime and native component.
7. Verify signatures and macOS notarization on the actual downloaded artifacts.

Signing requires publisher credentials. The workflow supports `MAC_CSC_LINK`,
`MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`,
`APPLE_TEAM_ID`, `WIN_CSC_LINK`, and `WIN_CSC_KEY_PASSWORD`. Without these,
unsigned builds are possible and aren't a friction-free public distribution.
The macOS notarization hook is `apps/ui/build/notarize.cjs`.

Automatic updates aren't implemented. Users install a newer release manually.
Native architecture compatibility and installer behavior require real platform
validation; successful JavaScript bundling alone doesn't establish release
readiness.
