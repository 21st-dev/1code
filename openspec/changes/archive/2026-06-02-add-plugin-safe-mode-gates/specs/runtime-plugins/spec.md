## ADDED Requirements

### Requirement: Plugin Safe Mode
The system SHALL provide a local plugin safe mode that blocks plugin-provided runtime capabilities without deleting plugin packages or review metadata.

#### Scenario: User enables plugin safe mode
- **WHEN** the user turns on plugin safe mode in Settings > Plugins
- **THEN** Locus keeps local plugin metadata browsing available
- **AND** blocks plugin enablement and plugin MCP runtime inclusion
- **AND** does not delete plugin packages, approved MCP identifiers, or review history
- **AND** does not describe safe mode as a sandbox for arbitrary plugin code

#### Scenario: Locus starts a Claude agent run in safe mode
- **WHEN** plugin safe mode is enabled
- **THEN** Locus-managed Claude agent config setup does not expose the user plugin directory through its isolated config directory
- **AND** project, global, and non-plugin MCP configuration behavior remains unchanged

### Requirement: Plugin Review Gates
The system SHALL gate plugin-provided runtime capabilities on the current locally reviewed manifest fingerprint.

#### Scenario: Plugin is new or changed
- **WHEN** a plugin has no current reviewed manifest fingerprint
- **THEN** Locus allows metadata, component, source pin, diagnostics, and change-summary browsing
- **AND** blocks enablement and plugin MCP runtime inclusion
- **AND** explains that local review is required before plugin-provided capabilities can be used

#### Scenario: Plugin fingerprint is reviewed
- **WHEN** the current plugin manifest fingerprint matches the last locally reviewed fingerprint
- **THEN** review gates may allow plugin-provided capabilities
- **AND** MCP runtime inclusion still requires explicit approval of the current redacted MCP configuration fingerprint
- **AND** Locus does not claim the plugin is verified, trusted, or sandboxed

### Requirement: Plugin MCP Runtime Gate
The system SHALL include plugin-provided MCP servers in agent runtime configuration only when all plugin gates pass.

#### Scenario: Enabled plugin MCP passes gates
- **WHEN** a Claude plugin is enabled, safe mode is off, the current plugin fingerprint is reviewed, the current MCP config fingerprint is approved, and no project/global MCP server overrides the same name
- **THEN** Locus may include that plugin MCP server in the agent runtime configuration

#### Scenario: Plugin MCP fails any gate
- **WHEN** a plugin MCP server is unapproved, safe mode is enabled, the plugin fingerprint is unreviewed, or the plugin is not enabled
- **THEN** Locus does not include that plugin MCP server in agent runtime configuration
- **AND** pending approval views distinguish review-gated MCP from approval-gated MCP

### Requirement: Plugin Gate UI Disclosure
The system SHALL show plugin safe-mode and review-gate state in Settings > Plugins.

#### Scenario: User views a blocked plugin
- **WHEN** a selected plugin is blocked by safe mode or review gates
- **THEN** the plugin detail shows the gate state and bounded reasons
- **AND** enablement or MCP approval actions are disabled or explained until the required gate is cleared

#### Scenario: User views a read-only Codex package
- **WHEN** the selected plugin belongs to the Codex plugin cache
- **THEN** Settings > Plugins continues to show it as read-only metadata
- **AND** does not show controls that imply Locus can execute the Codex package
