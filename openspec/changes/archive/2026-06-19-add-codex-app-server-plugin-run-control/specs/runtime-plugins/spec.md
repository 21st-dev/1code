## ADDED Requirements

### Requirement: Codex App-Server Plugin Run Control
The system SHALL mark Codex plugins as runtime-native-loadable only when app-server
starts from a Locus-managed isolated `CODEX_HOME` whose plugin cache and plugin
enablement config are rebuilt for the current run from review, safe mode,
activation identity, MCP approval, and recovery gates.

#### Scenario: Codex app-server lacks per-run plugin control
- **WHEN** app-server only exposes global plugin inventory, global skill or hook
  inventory, generic thread settings, or cache-backed plugin files
- **THEN** Locus keeps Codex native plugin execution blocked
- **AND** Settings > Plugins explains that cache presence or global enablement is
  not sufficient execution proof

#### Scenario: Locus starts app-server from an isolated plugin home
- **WHEN** Locus starts Codex app-server for a managed run
- **THEN** it points `CODEX_HOME` at a run-owned isolated home
- **AND** stages only allowed plugin cache entries into
  `plugins/cache/<marketplace>/<plugin>/<version>`
- **AND** writes plugin enablement config for the current Locus decision instead
  of copying global Codex plugin configuration
- **AND** proves allowed plugin components appear while sampled global plugins do
  not leak into the isolated home

#### Scenario: A Codex plugin is blocked before startup
- **WHEN** a plugin is disabled, unreviewed, drifted, safe-mode-blocked, failed to
  stage, or declares unapproved MCP servers
- **THEN** Locus does not stage that plugin into the isolated Codex home
- **AND** writes that plugin's app-server config override as disabled
- **AND** non-plugin Codex startup remains available
