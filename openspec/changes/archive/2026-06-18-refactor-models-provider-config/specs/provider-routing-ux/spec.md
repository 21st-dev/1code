## ADDED Requirements

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
