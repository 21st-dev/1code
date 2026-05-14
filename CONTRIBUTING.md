# Contributing to 1Code

## Building from Source

Prerequisites: Bun, Python, Xcode Command Line Tools (macOS)

```bash
bun install
bun run dev      # Development with hot reload
bun run build    # Production build
bun run package:mac  # Create distributable
```

## Open Source vs Hosted Version

This repository runs in **Local-only mode by default**. In Local-only mode the
desktop app does not call the official 1Code/21st hosted services, CDN,
analytics, error tracking, hosted auth, subscription, remote sandbox,
background-agent, hosted voice/TTS, or updater endpoints.

Local-only can only be disabled explicitly for development or internal builds:

```bash
ONECODE_LOCAL_ONLY=false bun run dev
# or
MAIN_VITE_LOCAL_ONLY=false bun run dev
```

User-configured providers, Ollama, local projects, Git, and GitHub operations
remain available in Local-only mode.

| Feature | Open Source | Hosted (1code.dev) |
|---------|-------------|-------------------|
| Local AI chat | Yes | Yes |
| Claude Code integration | Yes | Yes |
| Git worktrees | Yes | Yes |
| Terminal | Yes | Yes |
| Sign in / Sync | Blocked by Local-only | Yes |
| Inbox / Automations | Blocked by Local-only | Yes |
| Remote sandbox / Open Locally import | Blocked by Local-only | Yes |
| Background agents | Blocked by Local-only | Yes |
| Auto-updates | Blocked by Local-only | Yes |
| Private Discord & support | No | Yes |
| Early access update channel | Blocked by Local-only | Yes |

## Analytics & Telemetry

Analytics (PostHog) and error tracking (Sentry) are **disabled by default**.
They only activate when Local-only is explicitly disabled and the relevant
environment variables are configured. There is no hardcoded analytics key in
open-source builds.

## Contributing

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a PR

Join our [Discord](https://discord.gg/8ektTZGnj4) for discussions.

## License

Apache 2.0
