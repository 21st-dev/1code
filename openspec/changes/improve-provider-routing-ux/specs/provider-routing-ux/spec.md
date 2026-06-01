## ADDED Requirements

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
