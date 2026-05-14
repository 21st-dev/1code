## Context
The app is a local-first Electron desktop app. OAuth credentials are already encrypted in SQLite using Electron `safeStorage`, while the legacy custom Claude configuration is stored in renderer localStorage through Jotai. Chat requests currently pass `customConfig` from renderer to main, including the raw token.

## Goals
- Support Claude Code-compatible third-party APIs through a clear model, base URL, and token configuration.
- Support both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` without relying on users to know the current implementation detail.
- Keep provider secrets in main-process secure storage and avoid sending raw tokens through renderer chat requests.
- Preserve existing custom-provider users by migrating legacy localStorage configuration once.
- Make the verification path concrete: logged-out app startup, local repo selection, provider setup, and a simple agent read task.

## Non-Goals
- Replace the existing Claude OAuth multi-account system.
- Build a full multi-provider marketplace or routing layer.
- Solve unrelated TypeScript errors outside files touched by this change.
- Store or print third-party API secrets in logs, screenshots, PR bodies, or durable memory.

## Decisions
- Store provider secrets in SQLite encrypted with `safeStorage`, matching the existing Anthropic OAuth account pattern.
- Use an explicit auth mode rather than setting both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` at the same time. This avoids ambiguous precedence inside Claude Code while still supporting both environment-variable styles.
- Load the active provider configuration in main process when a Claude chat starts. Renderer should pass only non-secret selection state, or no provider payload at all when the active secure config is global.
- Migrate legacy `agents:claude-custom-config` from renderer once, then clear the token from localStorage. Keep non-secret UI state only if it is needed for immediate display.
- Redact token presence only as booleans in logs. Do not log prefixes or slices.

## Risks / Trade-offs
- `safeStorage` can be unavailable on some Linux setups. Existing code falls back to base64; this change should reuse that pattern and surface a warning rather than silently pretending encryption is active.
- A third-party endpoint may not be fully Anthropic-compatible. The smoke test should use a minimal read-only prompt first and report provider-specific failures without changing project files.
- A stacked branch may be easier to test because the local-startup PR contains fixes needed for logged-out startup. The final PR target can be adjusted after `chore/local-dev-readiness` merges.

## Migration Plan
1. Add secure provider-config schema and migration.
2. Add main-process tRPC procedures to get metadata, save token/config, clear config, and report encryption availability.
3. Update settings/onboarding to save through tRPC and stop persisting tokens in localStorage.
4. Add one-time legacy migration from `agents:claude-custom-config`.
5. Update Claude runtime env construction to inject either `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN` plus `ANTHROPIC_BASE_URL`.
6. Run build/type checks and the real smoke-test flow.

## Open Questions
- Which third-party Anthropic-compatible endpoint and test token should be used for the final end-to-end smoke test?
- Should the official Anthropic API key onboarding default to `ANTHROPIC_API_KEY`, while legacy migrated configs default to `ANTHROPIC_AUTH_TOKEN`?
