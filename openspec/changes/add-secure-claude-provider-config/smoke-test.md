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
- Computer Use MCP returned `Transport closed`, so the user completed UI clicks manually while Codex verified logs and local state.

## DeepSeek Anthropic-Compatible Smoke Test
- Date: 2026-05-14.
- Provider: DeepSeek Anthropic-compatible endpoint.
- Model: `deepseek-v4-pro`.
- Base URL: `https://api.deepseek.com/anthropic`.
- Auth env: `ANTHROPIC_API_KEY`.
- App state: logged out, local mode loaded the app without forcing desktop auth.
- Repository opened: `/Users/ethan/Documents/GitHub/agent-orchestration-for-me`.
- Prompt:
  ```text
  Read this repository and summarize the project structure in 5 bullets.
  ```
- Result: the agent returned a repository structure summary and then continued reading project files. Main-process logs showed SDK tool calls for `Thinking`, `Task`, `Bash`, `Glob`, and `Read`.
- Runtime evidence:
  - `Custom provider config` logged `model: 'deepseek-v4-pro'`, `baseUrl: 'https://api.deepseek.com/anthropic'`, `authMode: 'api_key'`, and `hasToken: true`.
  - Auth logs showed `ANTHROPIC_API_KEY: true`, `ANTHROPIC_BASE_URL: https://api.deepseek.com/anthropic`, `ANTHROPIC_AUTH_TOKEN: false`, and no token value or token prefix.

## Security Check
- SQLite metadata check:
  ```text
  model=deepseek-v4-pro
  base_url=https://api.deepseek.com/anthropic
  auth_mode=api_key
  encrypted_token_length=68
  stored_as_plain_sk=0
  ```
- Local search confirmed the active app DB did not store the provider token as a plain `sk-...` value.
- A malformed earlier token attempt caused Claude Code's own debug file to include the invalid `X-Api-Key` header value. The implementation now normalizes provider tokens, strips common zero-width characters, and rejects whitespace/control/non-visible characters before the token reaches Claude Code.
- The test credential was exposed during manual debugging and must be revoked/replaced before continued use.
