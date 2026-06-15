## ADDED Requirements

### Requirement: Runtime Adapter Source Metadata
The runtime core SHALL expose renderer-safe adapter source metadata for each runtime path.

#### Scenario: Runtime metadata is requested
- **WHEN** a desktop, CLI, job, protocol, or main-process caller requests runtime metadata
- **THEN** each runtime path may include adapter source, adapter version, transport type, fallback source, and fallback reason
- **AND** the metadata does not include provider secrets, gateway tokens, OAuth tokens, raw request headers, or secret-bearing environment values

#### Scenario: Runtime adapter falls back
- **WHEN** a selected runtime adapter falls back to another adapter source
- **THEN** the system emits a normalized fallback diagnostic before or during run startup
- **AND** the fallback does not silently upgrade a degraded or unsupported capability to supported

### Requirement: Stable External Runtime Contract
The runtime core SHALL keep the Locus external run, event, capability, preflight, and provider-binding contracts stable while allowing runtime-specific adapter internals.

#### Scenario: Codex desktop uses app-server
- **WHEN** Codex desktop/chat uses app-server internally
- **THEN** the adapter maps runtime-specific thread, turn, approval, tool, usage, and session data into the existing Locus normalized event and result shapes
- **AND** callers do not need to know whether the underlying Codex transport is SDK, app-server, ACP, or exec except through renderer-safe metadata

#### Scenario: Claude and Codex internals differ
- **WHEN** Claude and Codex use different official SDKs, protocols, permission callbacks, or session primitives
- **THEN** Locus does not force identical internal implementations
- **AND** it still gates shared product surfaces through capability manifests and normalized diagnostics
