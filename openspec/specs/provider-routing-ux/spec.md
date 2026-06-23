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

