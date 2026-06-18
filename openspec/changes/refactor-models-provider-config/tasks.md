## 1. Pre-flight

- [x] 1.1 Confirm `ensureLegacyProviderProfilesMigrated()` (`provider-profiles/storage.ts`)
  mirrors the legacy `claudeProviderConfig` into the `legacy-claude-provider` profile,
  so retiring the Override Model UI loses no user config.
- [x] 1.2 Confirm `custom-provider` still appears in selector/new-chat/chat-input and
  list every call site that must normalize or delete it.
- [x] 1.3 Confirm `handleRemoveCodexApiKey` has no confirm today, and that account
  remove / profile delete / logout DO confirm (parity target).
- [x] 1.4 Confirm `refactor-settings-ia` has landed or rebase this change after it,
  because both changes edit `agents-models-tab.tsx`. It has not landed in this
  worktree; this change is isolated on `codex/refactor-models-provider-config`
  and leaves the untracked `refactor-settings-ia` proposal untouched.
- [x] 1.5 Confirm the current runtime fallback in `agent-sdk-provider-startup.ts`
  calls `getActiveClaudeProviderConfig`, and identify tests that currently expect it.
- [x] 1.6 Confirm `api-key-onboarding-page.tsx` still calls
  `claudeProviderConfig.save` and writes `custom-provider`; include onboarding in
  this migration.
- [x] 1.7 Confirm `ipc-chat-transport.ts` reads
  `subChatClaudeModelSourceAtomFamily` directly before building tRPC input; include
  the transport/send boundary in normalization.

## 2. Retire the duplicate provider path (keep Provider Profiles)

- [x] 2.1 Remove the "Override Model" section UI from `agents-models-tab.tsx`
  (the `claudeProviderConfig`-backed model/token/authMode/baseUrl editor under API Keys).
- [x] 2.2 Verify the migrated `legacy-claude-provider` profile appears and is editable
  in the Provider Profiles list, so a pre-existing legacy config is reachable there.
- [x] 2.3 Remove `custom-provider` as a selectable model/source row from the selector.
- [x] 2.4 Update API-key/custom-model onboarding to create and select a Provider Profile
  (or remove the inline save path and deep-link to Provider Profiles). It must not
  call `claudeProviderConfig.save` or set `lastSelectedClaudeModelSourceAtom` to
  `custom-provider`.
- [x] 2.5 Add a shared `normalizeClaudeModelSourceForRun`-style helper in the renderer
  model/source helper layer. It maps legacy `custom-provider` to
  `provider-profile:legacy-claude-provider` when available; otherwise it returns
  Claude OAuth when usable or an actionable Provider Profiles setup blocker.
- [x] 2.6 Use the shared normalizer in new-chat, chat-input, and
  `ipc-chat-transport.ts` before tRPC input is built, so persisted sub-chat source
  state cannot bypass UI normalization.
- [x] 2.7 Remove the raw `getActiveClaudeProviderConfig` fallback from
  `agent-sdk-provider-startup.ts`; `claudeProviderConfig` remains only migration input.
- [x] 2.8 Update or add tests for onboarding provider-profile creation, source
  normalization at the send boundary, fallback deletion, and the no-legacy-runtime-
  source invariant.

## 3. Safety + shared components

- [x] 3.1 Add a confirmation to `handleRemoveCodexApiKey`; audit `handleReset` and add
  one where a destructive reset lacks it.
- [x] 3.2 Route all Models destructive confirmations through the app's dialog component
  (as used by `ConfirmArchiveDialog`), not native `window.confirm`.
- [x] 3.3 Replace the raw `<select>` (protocol/auth in the provider-profile form) with
  the app's `Select` component.

## 4. Codex + account-card consistency

- [x] 4.1 Consolidate Codex configuration into one block (subscription + API key), not
  split across the Accounts section and the API Keys collapsible.
- [x] 4.2 Make the Anthropic and Codex account cards use the same action affordance
  (one consistent overflow/kebab with the same actions) and symmetric section headers.

## 5. Low priority (optional this cut)

- [x] 5.1 Regroup the tab once Override Model is gone (clearer top grouping).
- [ ] 5.2 Strengthen the "connected/已启用" status styling.
- [ ] 5.3 Headers JSON box → key/value rows (validation already exists).

## 6. Validation

- [x] 6.1 `bun run ts:check`.
- [x] 6.2 `bun run lint` (changed-line biome) green.
- [x] 6.3 Run the architecture guard.
- [x] 6.4 Run the full test suite.
- [x] 6.5 `openspec validate refactor-models-provider-config --strict --no-interactive`.
- [x] 6.6 Manual smoke: onboarding creates/selects a Provider Profile; there is
  no Override Model editor or `custom-provider` selector row; removing the Codex
  API key now confirms; protocol/auth use the app `Select`; the Anthropic and
  Codex cards match. Legacy-only subcases (pre-existing provider editability and
  persisted `custom-provider` send-boundary resolution) are covered by automated
  migration/storage/source guards and are not a manual-release blocker because
  this provider-config path has not had a full external release with real
  user-owned legacy data.
  Real Electron dev UI smoke run 2026-06-19 with `bun run dev` and app userData
  `/Users/ethan/Library/Application Support/Agent Code for Me Dev`. Verified:
  local mode loaded without hosted login; Models showed no Override Model editor;
  Anthropic and Codex account cards were aligned; Codex subscription and Codex API
  key appeared in the same Codex account block; Provider Profiles was expanded;
  protocol/auth controls rendered as app `Select` combo boxes; a tokenless Ollama
  Provider Profile was created through the UI and persisted in
  `agent_provider_profiles` with `auth_mode=none`; the profile was editable and
  selectable from the chat model selector under the local provider profile group;
  no `custom-provider` selector row appeared.
  Follow-up real Electron dev UI smoke run 2026-06-19 after fixing macOS
  secure-storage preflight used a clean app userData override at
  `/tmp/locus-provider-smoke-UbBK5Z`. Verified: token-backed Custom Model
  onboarding created `agent_provider_profiles.id=mqk0xn4ovdeyosir`
  (`Custom Claude Provider`, `protocol=anthropic`,
  `base_url=https://provider-smoke.invalid/anthropic`,
  `default_model=claude-smoke-6-6`, `auth_mode=bearer`,
  `target_runtimes_json=["claude"]`) and stored a 68-byte encrypted token;
  `strings` over the temp SQLite DB and Chromium Local/Session Storage found no
  `sk-ant-smoke-token` plaintext and no `custom-provider`; the chat model
  selector selected `Custom Claude Provider · claude-smoke-6-6` under the
  `Claude 提供方配置` Provider Profile group with no `custom-provider` row; a
  send-boundary smoke to a fake `.invalid` endpoint created a run with
  `modelSource: 'provider-profile:mqk0xn4ovdeyosir'`,
  `providerProfileId: 'mqk0xn4ovdeyosir'`, and the Claude runtime used the local
  gateway URL `/profile/mqk0xn4ovdeyosir/anthropic/v1` with
  `ANTHROPIC_AUTH_TOKEN: true`; the expected fake-provider run failed after the
  provider gateway with `server_error`, not before provider-profile routing.
  Also verified in Settings > Models: no Override Model editor; Anthropic and
  Codex account cards are aligned; Codex subscription and API key are in the
  same Codex block; Provider Profiles is expanded; protocol/auth controls render
  as app `Select` combo boxes; the created Provider Profile is editable; a seeded
  fake local `codex-api-key.json` made the Codex API key row active, clicking the
  trash action opened the app confirmation dialog (`移除 Codex API 密钥` /
  `要从这台设备移除已保存的 Codex API 密钥吗？`), and confirming removed it.
  Legacy scope note: no real pre-existing legacy keychain-bound
  `claude_provider_config` fixture exists in this environment, and this path has
  not had a full external release with real user-owned legacy provider data.
  Attempting to synthesize one with a separate Electron `safeStorage` process
  produced a ciphertext that the dev app correctly refused to decrypt. The legacy
  editability and persisted `custom-provider` fallback invariants are therefore
  treated as automated-test/source-guard coverage, not as blocking manual smoke
  requirements for this release slice.
- [x] 6.7 Mark the Models section resolved in `docs/ideas/settings-per-tab-audit.md`.
