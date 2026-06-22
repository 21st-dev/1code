## MODIFIED Requirements
### Requirement: Runtime Proof Gates

The system SHALL prove runtime observability and adapter field support before claiming
verified registry support for a runtime.

#### Scenario: Claude observability is probed first

- **WHEN** Claude registry verification is implemented
- **THEN** Locus first proves whether Claude Agent SDK runs expose MCP connection,
  tool-list, and successful tool-call signals that can be recorded
- **AND** automatic `Verified on Claude` upgrades are limited to signals Locus can
  truthfully observe

#### Scenario: Codex app-server proof gates must pass

- **WHEN** Codex app-server registry support is implemented
- **THEN** Locus first proves the app-server adapter can represent required registry
  config fields and that app-server runs expose the required MCP proof signals
- **AND** required MCP proof signals include server readiness, tool inventory, a
  user-initiated tool-call request, and a post-execution successful tool result
  that can be tied to the same server, tool, runtime, entry fingerprint, and
  config fingerprint
- **AND** `item/tool/call`, approval prompts, model text, and `mcpServerStatus/list`
  are not sufficient by themselves to prove successful tool execution
- **AND** if either proof gate fails, Codex registry support is marked deferred or
  unavailable rather than verified

### Requirement: Local Runtime Verification

The system SHALL upgrade a registry-installed MCP server to verified status only from
local runtime evidence for the exact runtime and config fingerprint.

#### Scenario: Claude runtime proof is observed

- **WHEN** a Claude run discovers a registry-installed MCP server, connects to it,
  lists its tools, and successfully calls at least one tool
- **AND** the Phase-0 observability probe showed Locus can record those signals
- **AND** the observed tool result does not carry a runtime or domain-level error
  marker
- **THEN** the app records `Verified on Claude` for the local machine, server,
  runtime, entry fingerprint, and config fingerprint

#### Scenario: Codex app-server runtime proof is observed

- **WHEN** a Locus-managed Codex app-server run discovers a registry-installed MCP
  server, connects to it, lists its tools, and successfully calls at least one tool
- **AND** Codex app-server field-materialization and observability proof gates passed
- **AND** the app-server run emits or returns a post-execution MCP tool result that
  Locus can match to the initiating tool call, server name, tool name, runtime,
  entry fingerprint, and config fingerprint
- **AND** the observed tool result does not carry a runtime or domain-level error
  marker
- **THEN** the app records `Verified on Codex` for the local machine, server,
  runtime, entry fingerprint, and config fingerprint

#### Scenario: Codex proof is incomplete

- **WHEN** Codex app-server only exposes readiness, tool names, pre-execution
  `item/tool/call` requests, approvals, or model text
- **THEN** the server remains `Installed / Unverified` or Codex registry support
  remains deferred/unavailable
- **AND** the UI does not offer `Verified on Codex`

#### Scenario: Verification is not safe or has not happened

- **WHEN** a server is installed but no safe verification action or real run has
  produced a successful tool call
- **THEN** the server remains `Installed / Unverified`
- **AND** the UI does not imply that the server has been proven usable
