## ADDED Requirements

### Requirement: Desktop Runtime Preflight
The runtime core SHALL verify desktop run context before provider, MCP, attachment, or runtime adapter work starts.

#### Scenario: Desktop run context is verified
- **WHEN** a desktop Claude or Codex run is requested
- **THEN** the runtime core canonicalizes and verifies project, chat, sub-chat, cwd, runtime, mode, provider profile reference, MCP readiness, attachment readiness, and local-only constraints
- **AND** the verified result contains only renderer-safe metadata needed by downstream runtime setup
- **AND** provider work does not start from raw renderer `cwd`, provider config, MCP config, or attachment references

#### Scenario: Preflight blocks unsafe request
- **WHEN** the request contains an unregistered cwd, mismatched project/chat/sub-chat, unsupported attachment, provider profile blocker, MCP needs-auth blocker, or local-only violation
- **THEN** the runtime core rejects or blocks the run before provider work starts
- **AND** the diagnostic is renderer-safe and does not include provider secrets, OAuth tokens, gateway tokens, raw headers, or secret-bearing env values

### Requirement: Desktop Permission Policy
The runtime core SHALL map Locus plan, agent, and guarded desktop runs through a shared permission policy before runtime adapter startup.

#### Scenario: Policy is resolved for a desktop run
- **WHEN** a Claude or Codex desktop run starts
- **THEN** the runtime core resolves a `PermissionPolicy` from the verified context, requested mode, guarded scope contract, runtime capability state, and local-only state
- **AND** the selected adapter receives the policy rather than independently deriving durable plan or guarded semantics inside a route

#### Scenario: Runtime cannot enforce policy
- **WHEN** the selected runtime adapter cannot enforce the required plan-mode, guarded-run, approval, file, shell, or MCP side-effect policy before execution
- **THEN** the run fails closed or uses an explicitly supported fallback according to policy before provider work starts
- **AND** the capability state remains degraded or unsupported for that adapter until tests prove enforcement

### Requirement: Desktop Run Request Contract
The runtime core SHALL define a desktop-capable run request, event, cancellation, and result contract for desktop Claude and Codex adapters.

#### Scenario: Adapter receives desktop request
- **WHEN** a desktop runtime adapter is invoked
- **THEN** it receives a `DesktopRunRequest` containing run identity, verified context, provider binding metadata, permission policy, MCP readiness, attachment references, trace observer, cancellation signal, and session metadata
- **AND** the request excludes plaintext provider secrets, OAuth tokens, gateway tokens, raw headers, and arbitrary renderer-supplied env

#### Scenario: Adapter emits normalized events
- **WHEN** a runtime-specific stream emits assistant, reasoning, tool, guard, permission, question, MCP, usage, status, error, cancellation, or completion information
- **THEN** the adapter maps it into ordered `RunEvent` records with sanitized payloads
- **AND** callers do not need runtime-specific stream objects to persist or display the trace

### Requirement: Runtime Route Boundary
The runtime core SHALL keep durable runtime business rules in canonical owners rather than duplicating them in routes or transports.

#### Scenario: Route starts a runtime run
- **WHEN** a tRPC route or transport receives a desktop runtime request
- **THEN** it may validate the envelope, check caller authorization/status, and forward the request to the runtime control layer
- **AND** it does not add a second implementation of preflight, permission policy, provider binding, MCP readiness, capability truth, or trace persistence

#### Scenario: Temporary dual path is needed
- **WHEN** implementation temporarily keeps both old route-local behavior and a new service/adapter path
- **THEN** the change includes a canonical owner, explicit migration flag or gate, deletion condition, tests proving the active boundary, and a deprecation comment naming the removal plan
