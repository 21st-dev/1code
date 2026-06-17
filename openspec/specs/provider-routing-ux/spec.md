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

