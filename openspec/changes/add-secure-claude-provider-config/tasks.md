## 1. Proposal Gate
- [ ] 1.1 Review and approve this OpenSpec change before implementation.
- [ ] 1.2 Create a separate implementation branch, keeping `chore/local-dev-readiness` limited to startup/login/MCP fixes.

## 2. Secure Provider Storage
- [ ] 2.1 Add SQLite schema and migration for active Claude-compatible provider config.
- [ ] 2.2 Encrypt provider tokens with Electron `safeStorage`, reusing the existing fallback behavior when encryption is unavailable.
- [ ] 2.3 Add tRPC procedures for reading metadata, saving config, clearing config, and checking encryption availability.
- [ ] 2.4 Add one-time migration from legacy `agents:claude-custom-config` localStorage and clear the renderer-stored token.

## 3. Runtime Integration
- [ ] 3.1 Add provider auth mode support: `api_key` maps to `ANTHROPIC_API_KEY`, `auth_token` maps to `ANTHROPIC_AUTH_TOKEN`.
- [ ] 3.2 Load active provider config in main process for Claude chats instead of passing raw tokens through renderer chat requests.
- [ ] 3.3 Ensure custom provider config overrides shell/OAuth config only when active and complete.
- [ ] 3.4 Remove token prefixes/slices from logs and keep only redacted presence indicators.

## 4. UI Updates
- [ ] 4.1 Update onboarding custom-provider form to choose auth mode and save through secure tRPC mutation.
- [ ] 4.2 Update Settings > Models custom Claude fields to show token-set state without exposing stored token.
- [ ] 4.3 Keep reset behavior: clearing the config removes secure token and disables custom provider mode.

## 5. Verification
- [ ] 5.1 Run `bun run build`.
- [ ] 5.2 Run `bun run ts:check`; fix touched-path errors and report any unrelated remaining debt.
- [ ] 5.3 Smoke test logged-out launch: open app without login, select/open a local repo, configure Claude or Codex, send a simple read-only task, confirm the agent can read the project and respond.
- [ ] 5.4 Smoke test third-party Anthropic-compatible provider with a provided base URL/token/model and confirm the runtime uses the selected auth env var without logging the secret.
- [ ] 5.5 Update PR notes with exact validation results and any credential-dependent test limitations.
