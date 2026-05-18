## Context
The current Claude Code subscription flow has three separate pieces that do not yet form a reliable local-first credential story:

- `src/main/lib/claude-token.ts` can read Claude Code credentials from macOS Keychain, Linux secret stores, or `~/.claude/.credentials.json`, including `accessToken`, `refreshToken`, and `expiresAt`.
- `src/main/lib/trpc/routers/claude-code.ts` stores only a single encrypted OAuth token string in `anthropic_accounts.oauth_token` and `claude_code_credentials.oauth_token`.
- `src/main/lib/trpc/routers/claude.ts` decrypts that token and injects it as `CLAUDE_CODE_OAUTH_TOKEN`, but does not check expiry, refresh, or persist rotated credentials.

The renderer already has a disabled "existing token" path in `anthropic-onboarding-page.tsx` with a comment explaining the problem: importing a CLI access token alone is broken because old access tokens can expire in about 8 hours. This change should fix that root cause rather than re-enable the old access-token-only behavior.

## Goals
- Make Claude Code subscription use possible in local-only mode without 21st hosted auth.
- Import complete local Claude Code credentials, not just an access token.
- Persist enough encrypted metadata to refresh tokens before agent invocation.
- Keep credential handling in the main process and avoid exposing raw tokens through renderer state, localStorage, logs, screenshots, or durable docs.
- Keep the existing custom Claude-compatible provider path separate from official Claude Code subscription credentials.

## Non-Goals
- Implement a new Anthropic OAuth browser flow from scratch.
- Replace the user-owned Claude Code CLI login mechanism.
- Change third-party Claude-compatible provider configuration.
- Sync Claude credentials across devices or users.
- Bypass Anthropic subscription, plan, or rate-limit behavior.

## Decisions
- Treat local Claude Code credential import as the default local-first path. Hosted sandbox OAuth remains available only when local-only mode is explicitly disabled.
- Provide an app-triggered local login helper that runs the bundled `claude auth login` command and relies on Anthropic/Claude Code's official browser login rather than implementing OAuth in this app.
- Store a structured credential payload encrypted with Electron `safeStorage`, including access token, optional refresh token, optional expiry, optional scopes, source, and import/update timestamps.
- Reuse the existing `anthropic_accounts` multi-account model, but evolve its encrypted payload from "plain token string" to a versioned JSON credential envelope. Read code must remain backward compatible with existing encrypted plain strings.
- Add a central main-process credential service for Claude Code credential read/import/refresh/runtime resolution. Runtime code should ask that service for a valid access token instead of decrypting DB rows directly.
- Refresh when `expiresAt` is missing-but-refreshable only after a provider auth failure, and refresh proactively when expiry is within the existing five-minute buffer.
- Redact secrets as booleans only. Logs may say whether access/refresh tokens exist and when a token expires; logs must not include token prefixes, suffixes, or slices.

## Risks / Trade-offs
- Claude Code credential storage details can change across CLI versions. The import service should return source-specific status and never delete the user's original Claude Code credentials.
- Refresh requires network access to Anthropic. That is acceptable as part of user-selected Claude Code subscription use, but the path must not contact `21st.dev`, `1code.dev`, sandbox auth hosts, or hosted desktop auth.
- Existing DB rows may contain legacy encrypted plain access tokens with no refresh token. Those rows can still be used until they fail, but the UI should identify them as non-refreshable and prompt re-import from local Claude Code credentials.
- `safeStorage` can be unavailable on some Linux setups. This change should reuse the existing warning/fallback behavior and make encryption availability visible in metadata.

## Migration Plan
1. Add database columns or a replacement table shape for structured Claude Code credential metadata while preserving existing `anthropic_accounts` rows.
2. Introduce a versioned credential envelope and helpers to parse both legacy encrypted token strings and new encrypted JSON payloads.
3. Update system credential import to store access token plus refresh token, expiry, scopes, and source metadata.
4. Update runtime token resolution to refresh expiring credentials and write refreshed token data back before starting Claude Code.
5. Add a local login session API that starts the bundled Claude Code CLI, captures its official Anthropic login URL, allows cancellation, and imports local credentials after successful CLI exit.
6. Update onboarding, login retry modal, settings, and i18n copy to make local login/import the primary path in local-only mode.
7. Add smoke-test notes that prove a local-only launch can import credentials and send a simple Claude Code read task without hosted auth.

## Open Questions
- Resolved: include a "Launch Claude Code login" helper backed by bundled `claude auth login`; users may still import existing credentials if they already logged in outside the app.
- Should multiple imported Claude Code accounts be selectable immediately, or should this change only support one active imported account while preserving the existing multi-account schema?
