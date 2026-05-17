# Contributing to Agent Code for Me

## Building From Source

Prerequisites: Bun, Python, and Xcode Command Line Tools on macOS.

```bash
bun install
bun run dev
bun run build
bun run package:mac
```

Download bundled agent binaries before packaging:

```bash
bun run claude:download
bun run codex:download
```

## Windows Packaging

Build Windows x64 packages on a Windows machine or the `Package Windows` GitHub Actions workflow. This app includes native Electron dependencies such as SQLite and PTY support, so macOS cross-packaging can fail when those modules need Windows-native rebuilds.

For local Windows packaging:

```bash
bun install
node scripts/download-claude-binary.mjs --version=2.1.143 --platform win32-x64
node scripts/download-codex-binary.mjs --version=0.130.0 --platform win32-x64
bun run build
bun run package:win -- --x64
```

Unsigned Windows builds are suitable for limited internal testing, but Windows SmartScreen may warn users. Public distribution should use a proper code-signing certificate.

## Local-Only Boundary

This repository runs in **Local-only mode by default**. Hosted upstream product surfaces are removed or isolated from the default local-first build, and the Local-only guard remains as defense-in-depth against accidental upstream calls.

Local-only can only be disabled explicitly for development or internal compatibility checks:

```bash
AGENT_CODE_FOR_ME_LOCAL_ONLY=false bun run dev
# or
MAIN_VITE_LOCAL_ONLY=false bun run dev
```

User-configured providers, Ollama, local projects, Git, and GitHub operations remain available in Local-only mode.

| Feature | Local-first build | Hosted upstream |
|---------|-------------------|-----------------|
| Local AI chat | Yes | Yes |
| Claude Code integration | Yes | Yes |
| Codex integration | Yes | Yes |
| Git worktrees | Yes | Yes |
| Terminal | Yes | Yes |
| Sign in / sync | Removed from default build | Upstream only |
| Inbox / automations | Removed from default build | Upstream only |
| Remote sandbox / Open Locally import | Hidden from default build | Upstream only |
| Background agents | Removed from default build | Upstream only |
| Auto-updates | Removed from default build | Upstream only |

## Analytics & Telemetry

Hosted analytics and error tracking are not included in the default local-first build. Do not add telemetry or crash reporting without an explicit product/privacy proposal and opt-in design.

## Contribution Workflow

1. Keep changes scoped.
2. Preserve Local-only behavior unless a change explicitly targets hosted/internal mode.
3. Run `bun run ts:check`, `bun run build`, and `git diff --check` before submitting.
4. Use OpenSpec for new capabilities, breaking changes, architecture shifts, or security-sensitive changes.

## License

Apache License 2.0.
