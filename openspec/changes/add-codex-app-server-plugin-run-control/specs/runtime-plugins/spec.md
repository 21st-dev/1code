## ADDED Requirements

### Requirement: Codex App-Server Plugin Run Control
The system SHALL NOT mark Codex plugins as runtime-native-loadable until Codex
app-server provides a proven per-run or per-thread plugin control primitive that
Locus can bind to review, safe mode, activation identity, MCP approval, and
recovery gates.

#### Scenario: Codex app-server lacks per-run plugin control
- **WHEN** app-server only exposes global plugin inventory, global skill or hook
  inventory, generic thread settings, or cache-backed plugin files
- **THEN** Locus keeps Codex native plugin execution blocked
- **AND** Settings > Plugins explains that cache presence or global enablement is
  not sufficient execution proof

#### Scenario: Codex app-server exposes per-run plugin control
- **WHEN** app-server exposes a plugin allowlist, denylist, isolated plugin home, or
  equivalent run-scoped control primitive
- **THEN** Locus proves allowed plugin components appear in a managed run
- **AND** proves unreviewed, disabled, drifted, safe-mode-blocked, failed, or
  unapproved-MCP components are absent or filtered before activation
- **AND** only after that proof may Codex components move from `not-loadable` to a
  more capable target mode
