## 1. Proposal Gate

- [x] 1.1 Review this OpenSpec change and confirm the refactor scope.
- [x] 1.2 Verify no active OpenSpec change already owns Claude Code credential
      storage migration.

## 2. Storage Owner Refactor

- [x] 2.1 Add an owner-owned idempotent legacy migration function in
      `src/main/lib/claude-credentials.ts`.
- [x] 2.2 Make account list, active account metadata, credential metadata, and
      runtime credential resolution run migration before reading active state.
- [x] 2.3 Remove normal fallback reads from `claude_code_credentials.default`.
- [x] 2.4 Stop normal dual-writes to `claude_code_credentials.default` during
      login, local import, manual token import, active-account switch, and token
      refresh.
- [x] 2.5 Keep account deletion and disconnect cache clearing after the storage
      owner mutates active account state.
- [x] 2.6 Validate imported system Claude Code credentials before marking them
      connected; stale refresh failures such as `invalid_grant` must remove only
      the just-imported Locus account record and return reconnect guidance.
- [x] 2.7 Ensure runtime refresh failures mark the active Locus account as
      needing reconnect or remove it from active use without falling back to a
      legacy row or hosted auth.

## 3. Router And UI Cleanup

- [x] 3.1 Simplify `anthropic-accounts` router list/getActive to return only
      rows from `anthropic_accounts`.
- [x] 3.2 Replace or remove router-local `migrateLegacy` so migration has one
      owner.
- [x] 3.3 Remove `legacy-default` as a normal UI account ID and stop displaying
      the old row as a synthetic `Anthropic Account`.
- [x] 3.4 Ensure onboarding/settings invalidation still refreshes the canonical
      account list and active account status after import/login/disconnect.
- [x] 3.5 Split Settings/onboarding Claude Code connection actions so users can
      choose fresh OAuth login even when a local system credential exists.
- [x] 3.6 Replace import/reconnect error messages with stable, localized
      reconnect-needed guidance for stale local credentials and `invalid_grant`.

## 4. Verification

- [x] 4.1 Add tests proving a legacy-only install migrates to
      `anthropic_accounts`, sets active state, and clears the legacy row.
- [x] 4.2 Add tests proving list/getActive/metadata/runtime credential lookup do
      not fallback to `claude_code_credentials` after migration.
- [x] 4.3 Add tests proving new login/import/refresh writes only the canonical
      account ledger.
- [x] 4.4 Add tests proving deletion/disconnect cannot resurrect an account from
      the legacy row.
- [x] 4.5 Add tests proving stale local Keychain/import credentials do not get
      marked connected and do not block the fresh OAuth path.
- [x] 4.6 Add tests proving `invalid_grant` during runtime refresh does not
      continue to present the account as healthy or fallback to legacy storage.
- [x] 4.7 Run targeted Claude credential/account tests.
- [x] 4.8 Run `bun run lint:changed`, `bun run ts:check`, and
      `bun run architecture:check`.
- [x] 4.9 Run manual GUI smoke: delete stale account, reconnect with fresh OAuth,
      run a plain Claude prompt, then rerun the calculator MCP prompt.
      Evidence: 2026-06-21 real OAuth smoke used isolated
      `LOCUS_USER_DATA_DIR=/private/tmp/locus-real-oauth-smoke-20260621-220318/user-data`.
      The UI exposed fresh "使用 Anthropic 授权" alongside local credential
      import, completed OAuth for the temporary Locus DB, left
      `claude_code_credentials` empty, passed `scripts/smoke-local-claude-code.cjs`,
      and passed the calculator MCP prompt with `mcp__calculator__calculate`
      returning `391`.
