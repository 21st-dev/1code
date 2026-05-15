# Local Claude Code Credential Smoke Test

## Automated Checks

- `openspec validate add-local-claude-code-credentials --strict --no-interactive`: passed
- `git diff --check`: passed
- `bun run ts:check`: passed
- `bun run build`: passed

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

## Manual Credential Smoke Remaining

The import-and-send path should be manually verified from the UI because it reads the user's local Claude Code credential store and may consume Claude Code subscription usage:

1. Open Settings > Models.
2. Click `Import local credentials` under Anthropic Accounts.
3. Confirm the account row shows refreshable or non-refreshable local credential status.
4. Open a local repo chat.
5. Send a read-only prompt such as `Read AGENTS.md and summarize the repo instructions.`
6. Confirm no 21st hosted auth, sandbox status, or hosted desktop auth requests appear in main-process logs.
