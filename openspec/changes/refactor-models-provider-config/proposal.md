## Why

First per-tab content cut (after the Settings IA line). An audit of the Models tab
(`docs/ideas/settings-per-tab-audit.md`) — code review + a live visual pass — found
the tab exposes **two coexisting ways to configure a custom Claude provider**, plus
several consistency/safety smells:

- **Provider Profiles** (new, `providerProfiles.*`) and **Override Model** (legacy
  `claudeProviderConfig`) both configure a custom Claude endpoint. The runtime
  honors profiles first, then falls back to the legacy config
  (`agent-sdk-provider-startup.ts:183-206`). The UI shows both in different
  collapsibles with no stated precedence. Visually confirmed: Provider Profiles
  reads **0** while the legacy config holds the real value — the dual path is live.
- Removing the Codex API key has **no confirmation** (other destructive actions do).
- Codex config is split across two sections; the Anthropic vs Codex account cards
  use inconsistent action affordances (kebab vs inline text) and asymmetric headers.
- Confirmations use the native `window.confirm`; protocol/auth use raw `<select>`
  instead of the app's `Select` component.

The legacy→profile migration **already exists**:
`ensureLegacyProviderProfilesMigrated()` (`provider-profiles/storage.ts`) mirrors the
legacy config into a `legacy-claude-provider` profile. That means the correct fix is
not another migration table: the fix is to make Provider Profiles the only durable
custom-provider path and remove the legacy editor/source/runtime fallback that keep
the old path alive.

## What Changes

**Provider config — one durable path (the §A decision: keep Provider Profiles):**
- Retire the **Override Model** UI from the Models tab. The legacy config is already
  surfaced as the `legacy-claude-provider` profile (via
  `ensureLegacyProviderProfilesMigrated`), so users keep their settings — they edit
  them as a profile. No data dropped.
- Normalize legacy `custom-provider` selections to `provider-profile:legacy-claude-provider`
  when that migrated profile exists. If no migrated profile exists, fall back to
  Claude OAuth when available or show configuration guidance; do not silently use the
  raw legacy config as a second runtime source.
- Update API-key/custom-model onboarding so it creates/selects a Provider Profile
  instead of saving `claudeProviderConfig` and setting `custom-provider`.
- Remove the `custom-provider` choice from selector/new-chat/chat-input flows and
  normalize legacy source state at the actual send boundary. Add a shared
  normalization helper used by new-chat, chat-input, and `ipc-chat-transport`; the
  main runtime startup also rejects raw `custom-provider` so a missed renderer path
  cannot revive the old business path.
- Remove the raw `getActiveClaudeProviderConfig` fallback from Claude runtime startup.
  After this change, `claudeProviderConfig` is only a migration input, not an active
  business path.

**Safety + consistency:**
- Add a confirmation to **remove Codex API key** (`handleRemoveCodexApiKey`), matching
  the other destructive actions; audit `handleReset` for the same.
- Route all Models destructive confirmations through the app's dialog component
  instead of native `window.confirm`.
- Consolidate Codex config into one block; make the Anthropic and Codex account
  cards use the **same** action affordance and header pattern.
- Replace the raw `<select>` (protocol/auth) with the app's `Select` component.

**Low priority (do if cheap, else defer):** regroup the tab once Override Model is
gone; "已启用/connected" status styling; headers JSON box → key/value rows.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `provider-routing-ux`: extend the existing Settings > Models provider routing UX
  contract so Provider Profiles is the only custom Claude provider editor in that
  tab, legacy `custom-provider` is not shown as a selectable model source,
  credential-destructive actions confirm, and Models uses shared Select/dialog
  primitives.
- `claude-code-credentials`: update Claude runtime source semantics so legacy
  `custom-provider` state is normalized before runtime startup and the raw legacy
  provider config fallback is removed.

### Related Capabilities (unchanged)
- `agent-provider-profiles`: storage, presets, diagnostics, and gateway behavior stay
  the canonical Provider Profiles contract.
- `provider-credential-storage`: secure Codex API-key storage/removal behavior is
  unchanged; this slice only adds the renderer confirmation before removal.
- `provider-runtime-bindings`: provider-profile gateway/secret boundaries stay
  unchanged; this slice removes the legacy Claude-specific fallback into that
  boundary instead of changing the gateway contract.

## Impact

- **Code (renderer):** `agents-models-tab.tsx` (remove Override Model UI; add Codex
  remove confirm; consolidate Codex; unify account cards; swap `<select>`→`Select`;
  route confirms through the app dialog), `api-key-onboarding-page.tsx` (create/select
  a Provider Profile instead of saving `claudeProviderConfig`), plus selector/new-chat/
  chat-input/`ipc-chat-transport` source normalization so legacy `custom-provider` is
  neither selectable nor sendable as a durable source.
- **Code (shared renderer helper):** add a single Claude source-normalization helper
  (for example in `src/renderer/features/agents/lib/models.ts`) and route all
  send/start call sites through it.
- **Code (main):** `agent-sdk-provider-startup.ts` and tests: remove the raw
  `getActiveClaudeProviderConfig` runtime fallback; runtime must receive OAuth or a
  provider profile source after renderer/preflight normalization, and must fail
  closed if raw `custom-provider` still reaches it.
- **Persistence/behavior:** none lost — the legacy config is already mirrored to the
  `legacy-claude-provider` profile; users edit it there instead. Existing persisted
  `custom-provider` selections are normalized to that profile when possible. No new
  data migration table is needed.
- **Sequencing:** overlaps the pending `refactor-settings-ia` (Phase 3), which also
  edits `agents-models-tab.tsx` (it ADDS the Offline/Local-models section). Land
  `refactor-settings-ia` first, then rebase this per-tab content cut onto the final
  Models tab layout.
- **Docs:** mark the Models section of `settings-per-tab-audit.md` resolved.
