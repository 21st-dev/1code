## ADDED Requirements

### Requirement: Scoped Runtime-Native Plugin Activation
The system SHALL support project, chat, and sub-chat scoped runtime-native plugin
selection before generating a managed runtime configuration.

#### Scenario: No scoped selection exists
- **WHEN** a managed run starts without a project, chat, or sub-chat custom plugin
  selection
- **THEN** Locus uses the global runtime-native plugin enablement state
- **AND** still applies review, safe mode, activation identity, MCP approval, and
  staging gates before any plugin reaches the runtime

#### Scenario: A sub-chat has a custom selection
- **WHEN** a sub-chat scoped selection exists for the run
- **THEN** only the selected plugin review keys are eligible for native activation
- **AND** project, chat, and global enablement do not add extra plugins to that run
- **AND** unselected plugins are absent from generated Claude or Codex runtime config

#### Scenario: Scoped selection inherits
- **WHEN** a sub-chat scope is set to inherit
- **THEN** Locus resolves plugin selection from chat scope, then project scope, then
  global enablement
- **AND** the most specific custom scope wins

#### Scenario: A selected plugin is unsafe
- **WHEN** a scoped selection includes a plugin that is unreviewed, drifted,
  safe-mode-blocked, disabled globally, failed to stage, or declares unapproved MCP
  servers
- **THEN** that plugin remains blocked for the run
- **AND** the runtime starts without that plugin if non-plugin startup can proceed
