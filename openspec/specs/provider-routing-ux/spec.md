# provider-routing-ux Specification

## Purpose
TBD - created by archiving change improve-provider-routing-ux. Update Purpose after archive.
## Requirements
### Requirement: Provider Routing Settings Layout
The system SHALL render the Models settings tab with enough horizontal space for provider routing controls on desktop viewports while preserving the existing Settings navigation and non-Models tab layout.

#### Scenario: User opens Models settings on desktop
- **WHEN** the user opens Settings > Models
- **THEN** provider routing setup and saved profile rows use the available content width
- **AND** form fields, diagnostic checks, and action buttons do not overlap or truncate primary labels unnecessarily

### Requirement: Scannable Provider Profile Creation
The system SHALL present provider presets and profile setup as an accessible, scannable creation surface without changing the provider profile save contract.

#### Scenario: User chooses a provider preset
- **WHEN** the user selects a provider preset
- **THEN** the same saved profile form fields are populated from that preset
- **AND** the selection is visible as a chip/button state rather than hidden inside a narrow select-only control

### Requirement: Safe Provider Profile Summary Rows
The system SHALL summarize saved provider profiles with renderer-safe status, runtime targets, default bindings, and diagnostics without showing secret values.

#### Scenario: User reviews saved provider profiles
- **WHEN** saved provider profiles render in Settings > Models
- **THEN** each profile shows its name, protocol, auth state, default model, base URL, runtime targets, diagnostic status, and available default bindings
- **AND** token values, custom header values, gateway tokens, and raw upstream diagnostic payloads are not rendered

### Requirement: Provider Destination Token Re-entry
The system SHALL require token re-entry before a saved provider profile token can be reused with a changed endpoint, protocol, or auth mode.

#### Scenario: User edits a credentialed provider destination
- **WHEN** a saved provider profile has a stored token
- **AND** the profile endpoint, protocol, or auth mode changes
- **THEN** the save path requires a new token before preserving credentialed runtime use
- **AND** the previous token is not silently reused for the changed destination

### Requirement: Bilingual Provider Routing UX
The system SHALL localize app-authored provider routing labels in English and Simplified Chinese.

#### Scenario: User switches language
- **WHEN** the user views provider routing settings in English or Simplified Chinese
- **THEN** status labels, action labels, runtime target labels, and diagnostics labels render in the selected language
- **AND** provider names, protocols, model IDs, and URLs remain unchanged

### Requirement: Codex Account Source Selection
The Codex chat UI SHALL expose first-party account source selection separately from concrete model selection.

#### Scenario: User selects Codex account source
- **WHEN** the user configures a first-party Codex run
- **THEN** the UI shows ChatGPT account and OpenAI API key as account source choices outside the concrete model option list
- **AND** the model picker does not present first-party account sources as model rows
- **AND** saved provider profiles remain separate provider choices rather than first-party account source choices

#### Scenario: User selects Codex model
- **WHEN** the user opens the Codex model picker
- **THEN** concrete OpenAI model rows are grouped and labeled as model choices
- **AND** model rows do not change the selected first-party account source except through an explicit compatibility flow

### Requirement: Codex Source And Model Compatibility
The Codex chat UI SHALL keep first-party account source and model selection compatible before a run starts.

#### Scenario: API key source is selected
- **WHEN** OpenAI API key source is active
- **AND** a Codex model is available only through ChatGPT account source
- **THEN** the UI disables, filters, or requires confirmation before selecting that model
- **AND** the user sees a concise explanation that the model requires ChatGPT account source

#### Scenario: Selected model becomes incompatible
- **WHEN** the selected model is not supported by the newly selected account source
- **THEN** the UI resolves the mismatch before send by switching to a compatible model or asking the user to choose one
- **AND** the run request does not start with an incompatible first-party source/model pair

#### Scenario: Provider profile source is selected
- **WHEN** a Codex provider profile is selected
- **THEN** provider-profile compatibility continues to use provider-profile runtime target and diagnostic rules
- **AND** the first-party ChatGPT/API-key source control does not overwrite the provider-profile source silently

### Requirement: Single custom Claude provider editor in Models settings

The Models tab MUST expose Provider Profiles as the only editable custom Claude
provider configuration surface. It MUST NOT also present the legacy single-config
"Override Model" editor. Existing legacy configuration MUST remain available to
the user as a migrated provider profile, so no setting is lost.

#### Scenario: Only Provider Profiles is offered

- **WHEN** the user opens the Models tab to configure a custom Claude endpoint
- **THEN** they configure it through Provider Profiles, and there is no separate
  "Override Model" editor competing with it

#### Scenario: Existing legacy config survives as a profile

- **WHEN** a user who previously set the legacy Override Model opens the build that
  retired that UI
- **THEN** their configuration is present as the migrated `legacy-claude-provider`
  profile through the existing `ensureLegacyProviderProfilesMigrated` path
- **AND** the profile is editable in Provider Profiles, with nothing dropped

#### Scenario: Legacy source is not selectable

- **WHEN** the user opens model/source selection after this change
- **THEN** `custom-provider` is not shown as a selectable Claude source
- **AND** the migrated `legacy-claude-provider` profile is shown as a provider profile
  when legacy configuration exists

#### Scenario: Existing legacy selection is normalized

- **WHEN** an existing chat or preference still references the legacy
  `custom-provider` Claude source
- **AND** the migrated `legacy-claude-provider` profile exists
- **THEN** the UI resolves that selection to `provider-profile:legacy-claude-provider`
  before starting a run
- **AND** the run does not use raw `claudeProviderConfig` as a second provider path

#### Scenario: Onboarding creates the canonical provider path

- **WHEN** the user configures a Claude API key or custom Claude endpoint during
  onboarding
- **THEN** onboarding saves the credential as a Provider Profile and selects that
  provider profile as the Claude source
- **AND** onboarding does not save `claudeProviderConfig` or persist
  `custom-provider`

### Requirement: Models credential actions confirm before destructive changes

The Models tab MUST require confirmation before destructive credential actions
execute. This includes remove account, delete profile, log out, remove API key,
and reset actions rendered in the Models tab.

#### Scenario: Removing the Codex API key confirms

- **WHEN** the user activates "remove Codex API key"
- **THEN** a confirmation is required before the key is deleted, consistent with the
  other destructive actions in the tab

### Requirement: Models settings uses shared form and dialog components

The Models tab MUST use the app's shared form and dialog components for provider
configuration choices and confirmations. It MUST NOT use native `<select>` or
`window.confirm` for those controls.

#### Scenario: Choices and confirmations are consistent

- **WHEN** the user picks a protocol/auth mode or confirms a destructive action
- **THEN** the control is the app's `Select` / dialog component, not a raw `<select>`
  or a native `window.confirm` popup

### Requirement: Parallel account cards are presented consistently

The Anthropic and Codex account sections MUST use the same card layout, action
affordance, and header pattern, so equivalent accounts read and behave the same way.

#### Scenario: Account cards match

- **WHEN** the user views the Anthropic and Codex account cards
- **THEN** both present their actions the same way
- **AND** their section headers are symmetric

### Requirement: First-Run Provider Paths Use Canonical Sources

The first-run onboarding provider paths SHALL use the same canonical provider
and account sources as the rest of the app, without adding a second custom
provider editor or renderer-secret path.

#### Scenario: User saves an Anthropic API key during first run

- **WHEN** the user submits an Anthropic API key from first-run onboarding
- **THEN** onboarding saves it as a Claude-targeted Provider Profile
- **AND** selects the saved provider-profile source for Claude runs
- **AND** it does not save `claudeProviderConfig`, persist `custom-provider`, or
  store the key in renderer localStorage

#### Scenario: User saves a custom or local Claude-compatible provider

- **WHEN** the user submits a custom Claude-compatible base URL, model, auth mode,
  and optional token from first-run onboarding
- **THEN** onboarding saves it as a Provider Profile with renderer-safe metadata
- **AND** `No auth` remains available only as an explicit auth mode for local
  providers or trusted proxies
- **AND** plaintext tokens, gateway tokens, custom secret headers, and raw
  diagnostics are not returned to the renderer after save

#### Scenario: User chooses Codex API-key setup

- **WHEN** the user saves an OpenAI API key for Codex during first run
- **THEN** onboarding uses the app-managed Codex API-key secure-storage path
- **AND** the renderer derives the Codex auth method and status from the
  secure-storage and integration owners rather than storing a completion flag
- **AND** Codex chat requests do not accept or transmit the raw key

#### Scenario: User connects first-party Claude or Codex account

- **WHEN** the user connects Claude Code or Codex through first-party account auth
- **THEN** onboarding records the existing account/auth source used by runtime
  startup
- **AND** Provider Profile rows remain separate provider choices rather than
  first-party account sources

### Requirement: Engine selection is the sole runtime switch

The chat composition UI SHALL provide a single Engine control that selects the
runtime (Claude Code, Codex, Qwen Code, Kun) and SHALL be the only control that
changes the runtime. The Engine control SHALL surface runtime status derived from
the runtime capability manifest and runtime setup status (e.g. experimental,
unavailable, setup-required) without changing manifest data. Setup-required or
unavailable engines SHALL be non-runnable: they SHALL NOT change the selected
runtime, start a run, or create a sub-chat, though the UI MAY disable them or
route the user to setup. No other control — including the Model control — SHALL
change the selected runtime.

#### Scenario: Engine control switches runtime
- **WHEN** the user opens the Engine control
- **THEN** it lists the enabled runtimes with manifest/setup-derived status and
  selecting a ready runtime changes the runtime
- **AND** no other control changes the runtime

#### Scenario: Engine status reflects the manifest
- **WHEN** a runtime is experimental, unavailable, or requires setup
- **THEN** the Engine control shows that status from the runtime manifest/setup
  status rather than presenting the runtime as ready

#### Scenario: Setup-required engines cannot start work
- **WHEN** a runtime is unavailable or requires setup
- **THEN** selecting it does not change the selected runtime
- **AND** no run starts and no active-chat sub-chat is created
- **AND** the UI either disables the engine choice or routes the user to the
  relevant setup surface

### Requirement: Model control is runtime-scoped and never switches runtime

The chat composition UI SHALL provide a single Model control whose shape is
identical for every runtime and whose contents are scoped to the currently
selected Engine. It SHALL present that runtime's model sources, models, and
provider profiles, and SHALL show contextual options (such as Codex thinking and
account source, or Claude thinking) ONLY when the selected engine/model supports
them. The Model control's selected value SHALL be per-engine. New-chat selections
SHALL use the existing global/project defaults, while active-chat selections SHALL
use the current sub-chat model/source atom families before updating any
`lastSelected*` defaults for future chats. The Model control SHALL NOT change the
selected runtime.

#### Scenario: Model control content follows the selected engine
- **WHEN** the selected Engine changes
- **THEN** the Model control shows the new runtime's sources/models/profiles and
  its own per-engine selected value
- **AND** contextual options appear only for the runtimes/models that support them

#### Scenario: Model control never switches runtime
- **WHEN** the user selects any item in the Model control
- **THEN** the runtime is unchanged and only the model/source for the current
  Engine changes

#### Scenario: Active-chat model selection is sub-chat scoped
- **WHEN** the user changes Model state in an active-chat sub-chat
- **THEN** the current sub-chat's model/source state is updated
- **AND** other open sub-chats keep their own selected model/source state
- **AND** any `lastSelected*` update is used only as a default for later chats

#### Scenario: Claude and Codex selection behavior is preserved
- **WHEN** Claude Code or Codex is the selected Engine
- **THEN** model selection, thinking, Codex account source, source/model
  compatibility, provider-profile selection, and Ollama selection behave as before
  the split
- **AND** these behaviors are available from the Model control rather than a
  combined runtime+model menu

### Requirement: Runtime-managed Model state for runtimes without profile parity

The Model control SHALL render a runtime-managed / setup state for a runtime whose
provider-profile capability is not supported (e.g. Qwen Code's `degraded`
`providerProfiles`) instead of fabricating provider-profile parity, and SHALL NOT
present provider-profile rows for that runtime. Kun SHALL use the same Model
control rather than a bespoke selector, and the renderer SHALL handle only
source/profile identifiers and SHALL NOT receive plaintext provider secrets.

#### Scenario: Qwen shows runtime-managed state
- **WHEN** Qwen Code is the selected Engine
- **THEN** the Model control shows a runtime-managed / setup state, not
  provider-profile rows
- **AND** no provider secret is sent to the renderer

#### Scenario: Kun uses the shared Model control
- **WHEN** Kun is the selected Engine
- **THEN** its provider profiles and BYO config are shown through the same Model
  control used by other runtimes, not a bespoke Kun selector

### Requirement: Engine switch preserves empty and non-empty active-chat behavior

Switching the Engine in active chat SHALL preserve the existing distinction
between empty and non-empty sub-chats for ALL runtimes (Claude Code, Codex, Qwen
Code, Kun) — not only Claude and Codex. If the current active sub-chat is empty,
the Engine switch SHALL update that sub-chat in place without history attachment
or a new tab. If the current active chat has history, switching the Engine SHALL
start a new sub-chat that attaches the prior conversation as history context and
inherits per-runtime model preferences, after the existing confirmation. The
confirmation that previously lived inside the combined model selector SHALL be
presented by the Engine control. The same Engine and Model controls SHALL be used
on both the new-chat form and the active-chat input.

#### Scenario: Switching engine in an empty active sub-chat updates in place
- **WHEN** the user switches the Engine while the active sub-chat has no messages
- **THEN** the current sub-chat runtime is updated in place
- **AND** no history attachment is staged and no new sub-chat is created
- **AND** this works when switching into Qwen Code or Kun, not only Claude/Codex

#### Scenario: Switching engine in an active chat starts a new sub-chat
- **WHEN** the user switches the Engine while an active chat has history
- **THEN** the UI confirms, then creates a new sub-chat with the prior history
  attached and per-runtime model preferences inherited for the target runtime
- **AND** this works when switching into Qwen Code or Kun, not only Claude/Codex

#### Scenario: Switching into a runtime without provider profiles
- **WHEN** the target runtime has no provider-profile selection (e.g. Qwen)
- **THEN** the new sub-chat starts with that runtime's runtime-managed source
  rather than failing on absent provider-profile inheritance

#### Scenario: New-chat and active-chat use the same controls
- **WHEN** the Engine or Model control renders on the new-chat form and on the
  active-chat input
- **THEN** both surfaces use the same Engine and Model components with consistent
  behavior

### Requirement: Engine and Model controls are localized

The Engine and Model controls SHALL localize app-authored labels, runtime status
copy, and setup actions in English and Simplified Chinese. Provider names, model
IDs, profile names, protocols, and URLs SHALL remain unchanged.

#### Scenario: User switches language with Engine and Model controls visible
- **WHEN** the user views chat composition in English or Simplified Chinese
- **THEN** Engine, Model, setup-required/unavailable statuses, and setup actions
  render in the selected language
- **AND** provider names, model IDs, profile names, protocols, and URLs remain
  unchanged

