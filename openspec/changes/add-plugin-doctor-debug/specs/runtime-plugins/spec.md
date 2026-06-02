## ADDED Requirements
### Requirement: Plugin Doctor Report
The system SHALL provide a local plugin Doctor report that explains plugin catalog health and runtime gate posture without executing plugin code.

#### Scenario: User opens plugin Doctor
- **WHEN** the user opens Settings > Plugins
- **THEN** the app shows a Doctor summary derived from local plugin metadata
- **AND** the summary includes source status, manifest review posture, safe-mode posture, runtime gate posture, component availability, and MCP declaration posture
- **AND** the summary does not contact remote marketplaces or execute plugin package code

#### Scenario: Doctor sees blocked plugin capabilities
- **WHEN** a plugin is new, changed, read-only, missing review state, or blocked by safe mode
- **THEN** the Doctor report labels the affected checks as blocked or warning
- **AND** explains the concrete local reason without calling the plugin trusted or verified

### Requirement: Plugin Debug Details
The system SHALL provide per-plugin Debug details for local review and recovery.

#### Scenario: User selects a plugin
- **WHEN** the user selects a plugin in Settings > Plugins
- **THEN** the app shows per-plugin Debug details including runtime, source path, source pins, manifest fingerprint, last reviewed fingerprint, review status, safety gate, component counts, MCP server names, and local diagnostics
- **AND** redacts raw MCP secret values and does not expose arbitrary plugin source contents

### Requirement: Plugin Runtime Component Gates
The system SHALL gate plugin-provided runtime components consistently before exposing them to Locus agent workflows.

#### Scenario: Plugin command, skill, or agent is not reviewed
- **WHEN** a Claude plugin source is enabled but its current fingerprint is not locally reviewed
- **THEN** plugin-provided commands, skills, and agents from that plugin are not returned by Locus runtime component APIs
- **AND** the plugin remains visible in the plugin catalog and Doctor report

#### Scenario: Plugin safe mode is enabled
- **WHEN** global plugin safe mode is enabled
- **THEN** plugin-provided commands, skills, agents, and MCP servers are blocked from Locus-managed runtime paths
- **AND** local plugin metadata, review state, and Doctor/Debug visibility remain available

#### Scenario: Codex plugin package is discovered
- **WHEN** a Codex plugin cache package is discovered
- **THEN** Locus keeps it as read-only metadata
- **AND** does not expose Codex plugin commands, skills, agents, MCP servers, or executable code as Locus runtime components
