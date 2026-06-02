## Context
The app is packaged with `electron-builder`, already produces macOS ZIP artifacts and Windows NSIS installers, and currently exposes a manual GitHub Releases check. The automatic updater must not reintroduce the removed hosted upstream updater surface.

## Decisions
- Use `electron-updater` with the GitHub provider for `lupanpan1030/agent-code-for-me`.
- Enable automatic checks only in packaged macOS apps and Windows NSIS installs.
- Disable automatic updates in development, Linux, and Windows portable builds.
- Set `autoDownload = false` and `autoInstallOnAppQuit = false`.
- Store the auto-check preference in a small JSON file under Electron `userData` rather than adding a SQLite migration.
- Poll updater state from the About tab through tRPC; no renderer-side update feed requests.

## Non-Goals
- No silent background download.
- No silent restart or install.
- No private GitHub token in the app.
- No production-readiness claim for unsigned builds.
