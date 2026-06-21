## Context

The current storage model grew from a single Claude Code credential row into a
multi-account system. The result is a hybrid model:

- `anthropic_accounts` stores multiple encrypted credentials.
- `anthropic_settings.active_account_id` selects the active account.
- `claude_code_credentials.default` still acts as a legacy source, list fallback,
  active fallback, runtime fallback, and dual-write target.

That hybrid violates the repository rule against long-lived old/new duplicate
business paths. It also makes deletion semantics fragile: removing a new account
does not necessarily remove or stop using an old row.

## Goals

- Make `anthropic_accounts` and `anthropic_settings` the canonical account
  ledger for normal operation.
- Keep existing users working by migrating a legacy row exactly when needed.
- Remove runtime and UI fallback behavior that treats the legacy row as an
  active account.
- Stop normal writes to `claude_code_credentials`.
- Prevent stale system Claude Code credentials from being repeatedly imported
  as healthy Locus accounts.
- Keep a fresh Claude Code OAuth login path available even when a local system
  credential exists.
- Preserve main-process ownership of plaintext tokens.

## Non-Goals

- Do not remove the database table in this change; it remains available for
  upgrade migration compatibility.
- Do not change provider-profile custom-provider routing.
- Do not expose raw Claude Code tokens to the renderer.
- Do not redesign the Models settings UI beyond removing legacy account
  representation and making import-vs-fresh-login choices explicit.
- Do not delete, overwrite, or repair the user's macOS Keychain / system Claude
  Code credential entry; Locus may only remove its own local encrypted account
  records.

## Decisions

### Canonical Owner

`src/main/lib/claude-credentials.ts` owns Claude Code credential storage,
migration, active-account lookup, token refresh persistence, deletion
reconciliation, and runtime credential resolution.

Routers remain transport surfaces. They may call owner functions and shape
renderer-safe responses, but they must not implement separate account fallback
or migration logic.

### Migration Boundary

The app SHALL run an idempotent migration check before account list, active
status, metadata, and runtime credential resolution:

1. If `anthropic_accounts` has at least one row, ignore
   `claude_code_credentials.default` for business logic and clear it when safe.
2. If `anthropic_accounts` is empty and the legacy row has a credential, copy it
   into a new `anthropic_accounts` row, set it active in `anthropic_settings`,
   then clear the legacy row.
3. If migration cannot write the new row, leave the legacy row untouched and
   report reconnect/import guidance rather than using it as an active account.

### Normal Read Path

After the migration check, normal reads use only:

- account list: `anthropic_accounts`
- active account: `anthropic_settings.active_account_id` joined to
  `anthropic_accounts`
- runtime token: active account credential from `anthropic_accounts`
- metadata/status: active account credential from `anthropic_accounts`

No normal path returns `legacy-default`, displays a synthetic legacy account, or
uses `claude_code_credentials.default` as a fallback credential.

### Local Credential Import Validation

Importing an existing system Claude Code credential is not sufficient proof that
the credential is usable. The import path SHALL validate that the imported
credential can satisfy runtime preflight before marking it connected:

1. If the imported credential has a refresh token, the import path SHALL attempt
   a refresh validation before success, regardless of whether the current access
   token is already expired.
2. If the imported credential does not have a refresh token, it may only be
   stored as a non-refreshable credential when its access token is currently
   usable; an expired non-refreshable credential must fail with reconnect
   guidance.
3. If refresh validation fails with `invalid_grant` or another stale-token
   failure, Locus
   clears only the just-imported local Locus account record, leaves the system
   Keychain/source credential untouched, and returns reconnect guidance.

Settings and onboarding SHALL let users choose a fresh Claude Code OAuth login
even when local system credentials exist. The presence of a system credential
must not force the UI down the import path.

Manual raw access-token import remains a non-refreshable escape hatch because it
does not provide a refresh token or expiry proof to validate. It SHALL be stored
only in the canonical account ledger and reported as non-refreshable; system
credential refresh validation requirements do not imply that a raw pasted access
token can be made refreshable.

### Normal Write Path

New credential writes and refresh writes SHALL write only to
`anthropic_accounts`. The legacy row is not a compatibility mirror.

Allowed writes to `claude_code_credentials` after this change:

- none during normal app operation
- optional test setup fixtures only
- future schema cleanup may remove the table in a separate change after release
  compatibility is no longer needed

## Risks And Mitigations

- Risk: existing users with only legacy credentials may appear disconnected.
  Mitigation: migrate before list/status/runtime resolution and cover this with
  tests.
- Risk: failed migration could delete the only credential.
  Mitigation: copy and set active before clearing the legacy row; leave the
  legacy row untouched if the new write fails.
- Risk: stale runtime caches continue using deleted credentials.
  Mitigation: keep cache clearing on account mutation and add tests around
  runtime credential resolution after deletion/migration.
- Risk: macOS Keychain contains a Claude Code credential whose refresh token was
  revoked by the provider.
  Mitigation: validate imported local credentials, report stale-token state, and
  offer fresh OAuth without mutating the system Keychain entry.

## Implementation Notes

- Prefer a single owner function such as
  `ensureLegacyClaudeCodeCredentialMigrated()` called by list/getActive/metadata
  and runtime credential resolution.
- Remove `legacy` from active credential parsing once migration has run.
- Remove or repurpose `migrateLegacy` so it performs the same owner-owned
  migration instead of being a second router-local migration path.
- Split Settings/onboarding actions into explicit "import existing local
  credential" and "sign in again" paths. Do not let `hasLocalClaudeCredential`
  auto-short-circuit the fresh OAuth path.
- Normalize provider refresh failures such as `invalid_grant` into a stable,
  renderer-safe reconnect-needed diagnostic.
- Keep responses renderer-safe: return status, account IDs, display labels, and
  credential metadata only.
