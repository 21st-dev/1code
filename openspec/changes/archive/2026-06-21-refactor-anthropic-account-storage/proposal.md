# Change: Make Anthropic accounts the single Claude Code credential ledger

## Why

Claude Code account storage currently has two active business paths:
`anthropic_accounts` / `anthropic_settings` for multi-account state, and the
legacy `claude_code_credentials.default` row for older single-account state.
The legacy row is still read, displayed, migrated, and sometimes written during
normal operation, which allows deleted accounts to reappear and makes active
credential truth ambiguous.

The immediate deletion bug is handled as a focused fix. This change defines the
follow-up refactor that removes the long-lived dual-path model.

## What Changes

- `anthropic_accounts` plus `anthropic_settings` become the only active Claude
  Code account ledger.
- `claude_code_credentials` is retained only as a one-time migration source for
  existing installs.
- Successful migration copies the legacy credential into `anthropic_accounts`,
  sets it active in `anthropic_settings`, and clears the legacy row so it cannot
  be used as a runtime or UI fallback.
- New login, local import, manual token import, token refresh, account list,
  active account status, and runtime token resolution no longer dual-write or
  fallback to `claude_code_credentials`.
- The UI stops representing the legacy row as a `legacy-default` / generic
  `Anthropic Account` business account.
- Local Claude Code credential import validates refreshability before marking an
  account connected; stale system Keychain credentials that produce
  `invalid_grant` do not trap the user in an import/reconnect loop.
- Settings/onboarding surfaces provide a fresh Claude Code OAuth login path even
  when local system credentials are present, without deleting or mutating the
  user's system Claude Code Keychain entry.

## Impact

- Affected specs: `claude-code-credentials`
- Affected code:
  - `src/main/lib/claude-credentials.ts`
  - `src/main/lib/trpc/routers/anthropic-accounts.ts`
  - `src/main/lib/trpc/routers/claude-code.ts`
  - Settings/onboarding queries that invalidate or display Claude Code accounts
  - Claude runtime startup paths that call `getValidClaudeCodeCredential()`
  - Tests covering account migration, list/getActive, deletion, token refresh,
    stale local credential import, OAuth reconnect, and runtime startup
