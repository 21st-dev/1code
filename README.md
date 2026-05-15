# Agent Code for Me

Local-first desktop client for coding agents.

This project is a fork of [1Code](https://github.com/21st-dev/1code) adapted for a local-first workflow. It keeps the desktop UI, local project selection, worktrees, terminal, git tools, Claude Code, Codex, custom providers, MCP, skills, and encrypted local provider storage while removing upstream hosted product surfaces from the default build.

## Current Scope

- Local projects and local SQLite state
- Claude Code subscription, API key, and custom provider flows
- Codex subscription, API key, and local Codex integration
- Local chat, tools, terminal, git diff, staging, commit generation, and worktrees
- Ollama-first helper generation with Settings-configured provider fallback
- Local-only guard enabled by default as defense-in-depth
- Upstream hosted auth, subscription checks, remote sandbox, automations, inbox, analytics, error tracking, and updater UI removed or isolated from the default local-first build

## Local-Only Mode

Local-only mode is enabled by default. It prevents the desktop app from contacting upstream hosted services if a dormant compatibility path is accidentally reached. Hosted auth, subscription checks, remote sandbox/import, hosted voice/TTS fallback, automations, inbox, telemetry, and updater UI are not part of the default local-first product.

To intentionally test hosted/internal services, disable it explicitly:

```bash
AGENT_CODE_FOR_ME_LOCAL_ONLY=false bun run dev
# or
MAIN_VITE_LOCAL_ONLY=false bun run dev
```

User-configured AI provider endpoints, Ollama, local projects, Git, GitHub operations initiated by local workflows, and external links that are not upstream hosted services remain available.

## Development

```bash
bun install
bun run claude:download
bun run codex:download
bun run dev
```

Useful checks:

```bash
bun run ts:check
bun run build
git diff --check
```

## Packaging

```bash
bun run build
bun run package:mac
# or
bun run package:win
bun run package:linux
```

Auto-update publishing is not part of the default local-first build. If this fork later needs app updates, add a fork-owned update proposal and feed instead of reusing upstream hosted update paths.

## Notes

- Voice transcription uses a user-provided OpenAI API key only; the upstream hosted subscription fallback has been removed from the default build.
- Some compatibility names and paths such as `.1code/worktree.json`, `1code` CLI, and `~/.21st/worktrees` may still exist to avoid breaking existing local project data.
- Some upstream compatibility names remain to avoid breaking existing local project data, but hosted product surfaces should not be reintroduced without an OpenSpec proposal.

## License

Apache License 2.0. See [LICENSE](LICENSE).
