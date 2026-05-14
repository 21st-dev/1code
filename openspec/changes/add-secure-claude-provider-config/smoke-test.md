# Smoke Test: Secure Claude-Compatible Provider Config

## Required Inputs
- Local repository path to open in the app.
- One working provider credential:
  - Claude OAuth, or
  - Codex auth/API key, or
  - Anthropic-compatible `baseUrl`, `model`, `token`, and auth mode.

## Local Startup Check
1. Start dev app with Electron not forced into Node mode:
   ```bash
   env -u ELECTRON_RUN_AS_NODE bun run dev
   ```
2. Confirm main-process logs show:
   - `isAuthenticated(): false`
   - `Local mode: not authenticated, loading app`
   - `Database initialized`
   - no forced login redirect before the renderer loads.

## Provider Config Check
1. Open Settings > Models.
2. Enter custom provider model, base URL, token, and auth env mode.
3. Confirm `claude_provider_config` contains one row with non-secret metadata and an encrypted token length:
   ```bash
   sqlite3 "$HOME/Library/Application Support/Agents Dev/data/agents.db" \
     'select id, model, base_url, auth_mode, length(encrypted_token) from claude_provider_config;'
   ```
4. Confirm renderer localStorage no longer stores the raw provider token after migration.

## Agent Read Task Check
1. Launch app logged out.
2. Select or open a local repository.
3. Configure Claude or Codex credentials.
4. Send a read-only task:
   ```text
   Read package.json and summarize what this project is. Do not edit files.
   ```
5. Confirm the agent:
   - starts without requiring desktop login,
   - reads project files,
   - returns a project summary,
   - does not log token values or token prefixes.

## Current Run Notes
- `bun run build` passed.
- `bun run ts:check` still fails on pre-existing broad type debt. The new `ANTHROPIC_*` final-env type errors from this change were fixed.
- Dev startup required unsetting `ELECTRON_RUN_AS_NODE=1` in the Codex shell.
- The app started logged out and initialized the new `claude_provider_config` migration.
- Computer Use MCP returned `Transport closed`, so UI clicking could not be completed in this run.
- No real provider credential was available in the environment, so the credential-dependent agent and third-party endpoint checks remain blocked.
