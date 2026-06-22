## MODIFIED Requirements

### Requirement: Stable External Runtime Contract
The runtime core SHALL keep the Locus external run, event, capability, preflight, and provider-binding contracts stable while allowing runtime-specific adapter internals.

#### Scenario: Codex desktop uses app-server
- **WHEN** Codex desktop/chat uses app-server internally
- **THEN** the adapter maps runtime-specific thread, turn, approval, tool, usage, and session data into the existing Locus normalized event and result shapes
- **AND** callers do not need to know whether the underlying Codex transport is SDK, app-server, or exec except through renderer-safe metadata

#### Scenario: Claude and Codex internals differ
- **WHEN** Claude and Codex use different official SDKs, protocols, permission callbacks, or session primitives
- **THEN** Locus does not force identical internal implementations
- **AND** it still gates shared product surfaces through capability manifests and normalized diagnostics
