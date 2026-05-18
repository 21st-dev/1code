## ADDED Requirements
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
