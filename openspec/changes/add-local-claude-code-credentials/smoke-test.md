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
- Local external credential probe reports `found: false`, so the system CLI credential store did not expose an importable external credential during this check.
- Codex CLI reports `Logged in using ChatGPT`.

Note: this probe checks external Claude Code credential sources such as the system CLI/keychain path. It does not inspect the app's encrypted account database. The app-level Settings > Models state showed an active `Local Claude Code` account, and the follow-up Electron smoke below validated that encrypted app credential directly.

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

## App Credential Read-Only Smoke

Command:

```bash
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/Electron.app/Contents/MacOS/Electron scripts/smoke-electron-app --project=/Users/ethan/Documents/GitHub/agent-code-for-me
```

Observed on 2026-05-18:

- The smoke helper used the same dev app data path: `/Users/ethan/Library/Application Support/Agent Code for Me Dev/data/agents.db`.
- The active app account metadata was `displayName: "Local Claude Code"`, `storageFormat: "envelope"`, `refreshable: true`, `encryptionAvailable: true`, and `source: "manual"`.
- The helper used Electron safeStorage to decrypt the app-stored envelope without printing raw tokens.
- The bundled Claude Code SDK ran the read-only prompt: `Read AGENTS.md and summarize the repository instructions in one short paragraph. Do not edit files, do not write files, and do not run shell commands.`
- The helper allowed only `Read`, `Glob`, and `Grep` tool calls.
- The SDK emitted 48 messages and reported `claude_code_version: "2.1.143"`.
- `stderrBytes` was `0`.
- Hosted URL marker scan returned no matches for `21st.dev`, `1code.dev`, `21st.sh`, `e2b.app`, `csb.app`, or `codesandbox.io`.
- Result: passed.
