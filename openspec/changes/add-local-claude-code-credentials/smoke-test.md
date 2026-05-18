# Local Claude Code Credential Smoke Test

## Automated Checks

- `openspec validate add-local-claude-code-credentials --strict --no-interactive`: passed
- `git diff --check`: passed
- `bun run ts:check`: passed
- `bun run build`: passed
- `rg -n "shell\\.openExternal" src/main --glob '!**/*.svg'`: only the centralized `src/main/lib/local-only.ts` helper opens external URLs directly.

## Local CLI and Credential Probe

Commands:

```bash
resources/bin/darwin-arm64/claude --version
resources/bin/darwin-arm64/codex --version
~/.local/bin/claude --version
~/.local/bin/claude auth status
codex login status
bun -e 'import { getExistingClaudeCredentials } from "./src/main/lib/claude-token.ts"; const c = getExistingClaudeCredentials(); console.log(JSON.stringify({ found: Boolean(c), source: c?.source ?? null, refreshable: Boolean(c?.refreshToken), expiresAt: c?.expiresAt ?? null }, null, 2));'
```

Observed on 2026-05-18:

- Bundled Claude Code binary reports `2.1.143 (Claude Code)`.
- Bundled Codex binary reports `codex-cli 0.130.0`.
- System Claude Code binary reports `2.1.138 (Claude Code)`.
- System Claude Code auth status reports `loggedIn: false`, `authMethod: none`, and `apiProvider: firstParty`.
- Local Claude Code credential probe reports `found: false`, so there is currently no local Claude Code credential for the app to import on this machine.
- Codex CLI reports `Logged in using ChatGPT`.

## Local-Only Startup Smoke

Command:

```bash
env -u ELECTRON_RUN_AS_NODE bun run dev
```

Observed:

- App used dev `userData`: `/Users/ethan/Library/Application Support/Agent Code for Me Dev`
- Sentry skipped in local-only mode.
- Analytics skipped in local-only mode.
- Auto-updater skipped in local-only mode.
- Auth manager was present but unauthenticated.
- App loaded with `Local mode: not authenticated, loading app`.
- Window reached `ready to show`.
- Page finished loading.

## Credential Smoke Remaining

The login/import-and-send path still requires an authenticated UI smoke because the current machine has no local Claude Code credential to import. This path reads the user's local Claude Code credential store, may open an Anthropic browser login, and may consume Claude Code subscription usage:

1. Open Settings > Models.
2. Click `Connect` under Anthropic Accounts.
3. If local Claude Code credentials already exist, confirm the app imports them without opening hosted 21st auth.
4. If no local credentials exist, confirm the app opens Anthropic's official Claude Code OAuth login URL, accepts the returned authentication code, exchanges it locally, and imports the resulting local credentials.
5. Confirm the account row shows refreshable or non-refreshable local credential status.
6. Open a local repo chat.
7. Send a read-only prompt such as `Read AGENTS.md and summarize the repo instructions.`
8. Confirm no 21st hosted auth, sandbox status, or hosted desktop auth requests appear in main-process logs.
