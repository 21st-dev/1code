## Context

First per-tab content cut. The Models tab works but carries a dual custom-provider
path and consistency/safety smells (see `settings-per-tab-audit.md` Models section,
which combines a code review and a live visual pass). The key enabler: the legacy
config is **already** mirrored into a `legacy-claude-provider` profile by
`ensureLegacyProviderProfilesMigrated()`. That means this slice can remove the
legacy custom-provider editor/source/runtime fallback without writing a new data
migration: Provider Profiles becomes the single durable path.

## Goals / Non-Goals

**Goals:**
- One surface for custom Claude providers (Provider Profiles); retire Override Model.
- Remove legacy `custom-provider` as a selectable/durable Claude source; normalize
  existing persisted state to the migrated legacy provider profile when possible.
- Make onboarding create Provider Profiles directly; it must not write new
  `claudeProviderConfig` rows or persist `custom-provider` as the selected source.
- Remove the raw `getActiveClaudeProviderConfig` runtime fallback so `claudeProviderConfig`
  is only a migration input.
- Make destructive credential actions confirm; route confirms through the app dialog.
- Consolidate Codex config; unify the Anthropic/Codex account cards; swap raw
  `<select>` → the app `Select`.

**Non-Goals:**
- No new database migration/table; the legacy-to-profile mirror already exists.
- No change to provider-profile gateway, credential encryption, diagnostics, or
  profile save contracts.
- Not the Settings IA reorg (Phase 3, separate). Not the other tabs.
- Low-priority polish (regroup, status pill, JSON→key/value rows) is optional here.

## Decisions

- **Full retirement, not UI-only.** Remove the Override Model UI, remove
  `custom-provider` as a selectable source, and remove the runtime raw-config
  fallback (`getActiveClaudeProviderConfig` in `agent-sdk-provider-startup.ts:204`)
  in the same slice. This is the only way to satisfy the no old/new duplicate
  business path rule.
- **Normalize legacy source state before runtime.** Any persisted `custom-provider`
  source is a legacy value, not a durable option. When the migrated
  `legacy-claude-provider` profile exists, normalize to
  `provider-profile:legacy-claude-provider`. When it does not exist, fall back to
  Claude OAuth if a valid credential exists; otherwise prompt the user to configure
  a Provider Profile. Do not start a run from raw `claudeProviderConfig`.
- **Normalize at the real send boundary, not only in visible UI state.** Put the
  source normalization in a shared helper (for example
  `src/renderer/features/agents/lib/models.ts`) that takes the persisted Claude
  source plus available provider profiles/credential status and returns either a
  sendable source or an actionable blocker. Use it from new-chat setup,
  chat-input display/send logic, and `ipc-chat-transport` before tRPC input is built.
  Runtime startup must also fail closed if raw `custom-provider` reaches main.
- **Onboarding writes the canonical path.** API-key/custom-model onboarding must save
  a Provider Profile with the appropriate Claude target and set the selected Claude
  source to `provider-profile:<id>`. It must not call `claudeProviderConfig.save` or
  set `lastSelectedClaudeModelSourceAtom` to `custom-provider`. If the product does
  not want inline provider-profile creation in onboarding, the alternative is to
  remove that form path and deep-link to Provider Profiles; it must not keep the old
  save path.
- **Rely on the existing migration, don't rebuild it.** `ensureLegacyProviderProfilesMigrated`
  already creates `legacy-claude-provider` (and `legacy-${purpose}` helper profiles).
  The cut surfaces that profile and drops the duplicate editor — users keep their config.
- **Extend existing provider-routing UX and Claude credential semantics, don't create a
  new provider capability.**
  This is a Settings > Models composition change. Provider profile storage/gateway
  remains under `agent-provider-profiles`, secure Codex key storage/removal remains
  under `provider-credential-storage`, and Claude runtime source normalization is
  specified under `claude-code-credentials`.
- **Reuse shared components.** Confirmations → the app's dialog (as used by
  `ConfirmArchiveDialog`); choices → the app `Select`. No new component work.
- **Account-card unification.** Pick one affordance for both Anthropic and Codex
  cards (recommend a consistent kebab/overflow with the same actions) and symmetric
  section headers.

## Risks / Trade-offs

- **A user relied on Override Model and is confused it "moved" to Profiles** →
  Mitigation: the migrated `legacy-claude-provider` profile carries their values; it
  is visible and editable in the one remaining surface. Consider a one-time note.
- **A persisted `custom-provider` source exists but no migrated profile is available** →
  Mitigation: do not use raw legacy config; fall back to Claude OAuth if available or
  block with an actionable Provider Profiles setup prompt.
- **A send path bypasses UI normalization** → Mitigation: the shared helper is required
  at `ipc-chat-transport` and covered by tests that seed persisted
  `subChatClaudeModelSourceAtomFamily` with `custom-provider`.
- **Onboarding reintroduces the old path** → Mitigation: onboarding saves Provider
  Profiles directly and tests assert it does not call `claudeProviderConfig.save` or
  persist `custom-provider`.
- **Runtime fallback removal regresses local-only or provider-profile startup** →
  Mitigation: update startup tests to cover legacy-source normalization,
  provider-profile runtime startup, OAuth isolation, and the no-raw-fallback case.
- **Conflict with Phase 3 (`refactor-settings-ia`), which also edits the Models tab**
  → Mitigation: land `refactor-settings-ia` first, then rebase this per-tab content
  cut onto the final Models tab layout.

## Migration Plan

1. After `refactor-settings-ia` lands, ensure the legacy profile migration runs on
   Provider Profiles list/read paths and verify `legacy-claude-provider` appears when
   old `claudeProviderConfig` data exists.
2. Remove the Override Model UI; add the Codex-remove confirm; route confirms
   through the app dialog; consolidate Codex; unify account cards; swap
   `<select>`→`Select`.
3. Update API-key/custom-model onboarding to create/select a Provider Profile or
   deep-link to Provider Profiles; it must not write `claudeProviderConfig` or
   `custom-provider`.
4. Add the shared source-normalization helper and use it from new-chat,
   chat-input, and `ipc-chat-transport`; remove `custom-provider` from selectable
   choices and normalize persisted legacy state before send.
5. Remove the raw `getActiveClaudeProviderConfig` runtime fallback; update runtime
   tests so a raw legacy config is no longer a startup source.
6. Verify: `bun run check`. Manual smoke: a pre-existing legacy provider is editable
   as a profile, no Override Model editor or `custom-provider` model row remains,
   onboarding creates/selects a Provider Profile, removing the Codex key confirms,
   protocol/auth use the app Select, and a legacy custom-provider preference runs
   through the migrated profile or prompts safely from the send path.
7. Rollback: pure revert; no persistence schema change.

## Open Questions

- None blocking.
