## ADDED Requirements

### Requirement: Plugin Manifest Fingerprints
The system SHALL compute local manifest fingerprints for discovered plugin packages without executing plugin code.

#### Scenario: Plugin package is discovered
- **WHEN** Locus scans a Claude Code or Codex plugin package
- **THEN** it computes a deterministic fingerprint from bounded manifest and component declaration metadata
- **AND** it does not hash arbitrary source code as proof of trust
- **AND** it does not execute plugin JavaScript or native code

### Requirement: Plugin Update Review State
The system SHALL persist local update-review state for plugin fingerprints.

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes Settings > Plugins
- **THEN** Locus compares the current plugin fingerprint with the previously seen and reviewed fingerprints
- **AND** reports whether the plugin is new, unchanged, changed, or locally reviewed
- **AND** does not download, install, update, enable, or execute plugin packages

#### Scenario: User marks a plugin reviewed
- **WHEN** the user marks the selected plugin fingerprint as reviewed
- **THEN** Locus stores the current fingerprint and review timestamp locally
- **AND** does not change plugin enablement, MCP approval, target mode, or execution status

### Requirement: Plugin Source Pin Metadata
The system SHALL surface available source/store pin metadata as advisory review input.

#### Scenario: Pin metadata is available
- **WHEN** a plugin package exposes a cache version, lock-file source ref, or equivalent stable source pin
- **THEN** Settings > Plugins shows that pin metadata in the plugin detail
- **AND** labels it as advisory review metadata rather than proof of safety

#### Scenario: Pin metadata is unavailable
- **WHEN** no source/store pin can be found
- **THEN** Settings > Plugins clearly reports that no source pin is available
- **AND** does not invent a pin or mark the package as verified

### Requirement: Bounded Plugin Change Summaries
The system SHALL show bounded local summaries of plugin manifest changes.

#### Scenario: Manifest metadata changes
- **WHEN** the current fingerprint differs from the last reviewed fingerprint
- **THEN** the plugin detail shows a bounded summary of changed review fields such as version, target mode, component counts, MCP declarations, or source pin
- **AND** the summary omits plugin source code and secrets

#### Scenario: No reviewed baseline exists
- **WHEN** the plugin has not yet been reviewed locally
- **THEN** the plugin detail asks for local review rather than claiming the package is safe
