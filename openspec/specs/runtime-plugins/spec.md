# runtime-plugins Specification

## Purpose
TBD - created by archiving change add-dual-runtime-plugins. Update Purpose after archive.
## Requirements
### Requirement: Runtime-Aware Plugin Catalog
The system SHALL list local plugin packages by runtime so Claude Code plugins and Codex plugins are not presented as the same installation format.

#### Scenario: User opens Plugins settings
- **WHEN** the user opens Settings > Plugins
- **THEN** the app shows plugins grouped or filterable by runtime
- **AND** Claude Code plugins are discovered from the Claude plugin marketplace directory
- **AND** Codex plugins are discovered from the Codex plugin cache directory

#### Scenario: Runtime has no plugins
- **WHEN** one runtime has no discoverable plugin packages
- **THEN** the app shows an empty state for that runtime
- **AND** does not imply that the other runtime's plugins apply to it

### Requirement: Runtime-Scoped Plugin Actions
The system SHALL keep plugin actions scoped to the runtime that owns the plugin package.

#### Scenario: User views a Claude Code plugin
- **WHEN** the selected plugin belongs to Claude Code
- **THEN** the app may show enable and disable controls backed by Claude settings
- **AND** the control does not affect Codex plugin packages

#### Scenario: User views a Codex plugin
- **WHEN** the selected plugin belongs to Codex
- **THEN** the app shows it as an installed Codex package
- **AND** does not show a fake enable or disable control

### Requirement: Explicit Plugin MCP Approval
The system SHALL require explicit approval before plugin-provided MCP servers become active tool connections.

#### Scenario: User enables a Claude Code plugin with MCP servers
- **WHEN** the user enables the plugin
- **THEN** the plugin package becomes enabled for Claude Code
- **AND** MCP servers from that plugin remain pending until the user explicitly approves them

#### Scenario: User disables a Claude Code plugin
- **WHEN** the user disables the plugin
- **THEN** the plugin package is disabled for Claude Code
- **AND** approvals for MCP servers from that plugin are revoked

### Requirement: Plugin Source Browser
The system SHALL provide a read-only view of known plugin sources so users can distinguish where runtime plugin packages are discovered from.

#### Scenario: User opens plugin sources
- **WHEN** the user opens the Sources view in Settings > Plugins
- **THEN** the app lists known plugin sources by runtime
- **AND** each source shows its path, status, source type, trust label, and plugin count

#### Scenario: Source root is empty or missing
- **WHEN** a runtime has no discovered plugin packages
- **THEN** the app still shows the runtime's expected local source root
- **AND** labels it as empty or missing instead of hiding the runtime

### Requirement: Read-Only Source Handling
The system SHALL keep plugin source browsing read-only until explicit install/update flows are designed.

#### Scenario: User views a source
- **WHEN** the user selects a plugin source
- **THEN** the app shows install guidance for that runtime
- **AND** does not show remote install, update, enable, or delete controls

#### Scenario: User refreshes plugin metadata
- **WHEN** the user refreshes plugins from the Sources view
- **THEN** the app re-scans local/cache plugin metadata
- **AND** does not contact remote plugin marketplaces

