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

## Local-Only Boundary

This repository runs in **Local-only mode by default**. In Local-only mode the desktop app does not call upstream hosted services, CDN update feeds, analytics, error tracking, hosted auth, subscription, remote sandbox, background-agent, hosted voice/TTS, automations, inbox, or updater endpoints.

Local-only can only be disabled explicitly for development or internal builds:

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
| Sign in / sync | Blocked by Local-only | Upstream only |
| Inbox / automations | Blocked by Local-only | Upstream only |
| Remote sandbox / Open Locally import | Blocked by Local-only | Upstream only |
| Background agents | Blocked by Local-only | Upstream only |
| Auto-updates | Disabled unless you configure your own feed | Upstream only |

## Analytics & Telemetry

Analytics and error tracking are disabled by default. They only activate when Local-only is explicitly disabled and the relevant environment variables are configured. There is no hardcoded analytics key in this local-first build.

## Contribution Workflow

1. Keep changes scoped.
2. Preserve Local-only behavior unless a change explicitly targets hosted/internal mode.
3. Run `bun run ts:check`, `bun run build`, and `git diff --check` before submitting.
4. Use OpenSpec for new capabilities, breaking changes, architecture shifts, or security-sensitive changes.

## License

Apache License 2.0.
