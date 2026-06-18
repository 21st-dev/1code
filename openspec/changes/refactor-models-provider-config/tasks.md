## 1. Pre-flight

- [ ] 1.1 Confirm `ensureLegacyProviderProfilesMigrated()` (`provider-profiles/storage.ts`)
  mirrors the legacy `claudeProviderConfig` into the `legacy-claude-provider` profile,
  so retiring the Override Model UI loses no user config.
- [ ] 1.2 Confirm `custom-provider` still appears in selector/new-chat/chat-input and
  list every call site that must normalize or delete it.
- [ ] 1.3 Confirm `handleRemoveCodexApiKey` has no confirm today, and that account
  remove / profile delete / logout DO confirm (parity target).
- [ ] 1.4 Confirm `refactor-settings-ia` has landed or rebase this change after it,
  because both changes edit `agents-models-tab.tsx`.
- [ ] 1.5 Confirm the current runtime fallback in `agent-sdk-provider-startup.ts`
  calls `getActiveClaudeProviderConfig`, and identify tests that currently expect it.
- [ ] 1.6 Confirm `api-key-onboarding-page.tsx` still calls
  `claudeProviderConfig.save` and writes `custom-provider`; include onboarding in
  this migration.
- [ ] 1.7 Confirm `ipc-chat-transport.ts` reads
  `subChatClaudeModelSourceAtomFamily` directly before building tRPC input; include
  the transport/send boundary in normalization.

## 2. Retire the duplicate provider path (keep Provider Profiles)

- [ ] 2.1 Remove the "Override Model" section UI from `agents-models-tab.tsx`
  (the `claudeProviderConfig`-backed model/token/authMode/baseUrl editor under API Keys).
- [ ] 2.2 Verify the migrated `legacy-claude-provider` profile appears and is editable
  in the Provider Profiles list, so a pre-existing legacy config is reachable there.
- [ ] 2.3 Remove `custom-provider` as a selectable model/source row from the selector.
- [ ] 2.4 Update API-key/custom-model onboarding to create and select a Provider Profile
  (or remove the inline save path and deep-link to Provider Profiles). It must not
  call `claudeProviderConfig.save` or set `lastSelectedClaudeModelSourceAtom` to
  `custom-provider`.
- [ ] 2.5 Add a shared `normalizeClaudeModelSourceForRun`-style helper in the renderer
  model/source helper layer. It maps legacy `custom-provider` to
  `provider-profile:legacy-claude-provider` when available; otherwise it returns
  Claude OAuth when usable or an actionable Provider Profiles setup blocker.
- [ ] 2.6 Use the shared normalizer in new-chat, chat-input, and
  `ipc-chat-transport.ts` before tRPC input is built, so persisted sub-chat source
  state cannot bypass UI normalization.
- [ ] 2.7 Remove the raw `getActiveClaudeProviderConfig` fallback from
  `agent-sdk-provider-startup.ts`; `claudeProviderConfig` remains only migration input.
- [ ] 2.8 Update or add tests for onboarding provider-profile creation, source
  normalization at the send boundary, fallback deletion, and the no-legacy-runtime-
  source invariant.

## 3. Safety + shared components

- [ ] 3.1 Add a confirmation to `handleRemoveCodexApiKey`; audit `handleReset` and add
  one where a destructive reset lacks it.
- [ ] 3.2 Route all Models destructive confirmations through the app's dialog component
  (as used by `ConfirmArchiveDialog`), not native `window.confirm`.
- [ ] 3.3 Replace the raw `<select>` (protocol/auth in the provider-profile form) with
  the app's `Select` component.

## 4. Codex + account-card consistency

- [ ] 4.1 Consolidate Codex configuration into one block (subscription + API key), not
  split across the Accounts section and the API Keys collapsible.
- [ ] 4.2 Make the Anthropic and Codex account cards use the same action affordance
  (one consistent overflow/kebab with the same actions) and symmetric section headers.

## 5. Low priority (optional this cut)

- [ ] 5.1 Regroup the tab once Override Model is gone (clearer top grouping).
- [ ] 5.2 Strengthen the "connected/已启用" status styling.
- [ ] 5.3 Headers JSON box → key/value rows (validation already exists).

## 6. Validation

- [ ] 6.1 `bun run ts:check`.
- [ ] 6.2 `bun run lint` (changed-line biome) green.
- [ ] 6.3 Run the architecture guard.
- [ ] 6.4 Run the full test suite.
- [ ] 6.5 `openspec validate refactor-models-provider-config --strict --no-interactive`.
- [ ] 6.6 Manual smoke: a pre-existing legacy provider is editable as a profile;
  onboarding creates/selects a Provider Profile; there is no Override Model editor
  or `custom-provider` selector row; a persisted `custom-provider` sub-chat source
  resolves at send time to `provider-profile:legacy-claude-provider` when available
  or prompts safely; removing the Codex API key now confirms; protocol/auth use the
  app `Select`; the Anthropic and Codex cards match.
- [ ] 6.7 Mark the Models section resolved in `docs/ideas/settings-per-tab-audit.md`.
