# Agent Code for Me

Local-first desktop client for coding agents.

This project is a fork of [1Code](https://github.com/21st-dev/1code) adapted for a local-first workflow. It keeps the desktop UI, local project selection, worktrees, terminal, git tools, Claude Code, Codex, custom providers, MCP, skills, and encrypted local provider storage while disabling upstream hosted services by default.

## Current Scope

- Local projects and local SQLite state
- Claude Code subscription, API key, and custom provider flows
- Codex subscription, API key, and local Codex integration
- Local chat, tools, terminal, git diff, staging, commit generation, and worktrees
- Ollama-first helper generation with Settings-configured provider fallback
- Local-only mode enabled by default
- Upstream hosted auth, subscription checks, remote sandbox, automations, inbox, analytics, error tracking, and updater calls blocked unless explicitly opted in for internal development

## Local-Only Mode

Local-only mode is enabled by default. It prevents the desktop app from contacting upstream hosted services, CDN update feeds, analytics, error tracking, hosted auth, remote sandbox/import, hosted voice/TTS fallback, automations, and inbox endpoints.

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

Auto-update publishing is not configured by default. If you later operate your own update feed, set `MAIN_VITE_UPDATE_FEED_URL` and configure signing/publishing separately.

## Notes

- Voice transcription is currently not a core local workflow and may require additional local/provider configuration later.
- Some compatibility names and paths such as `.1code/worktree.json`, `1code` CLI, and `~/.21st/worktrees` may still exist to avoid breaking existing local project data.
- Some upstream cloud modules remain in the codebase but are guarded by Local-only mode.

## License

Apache License 2.0. See [LICENSE](LICENSE).
