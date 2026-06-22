## MODIFIED Requirements

### Requirement: Codex Runtime Availability Status
The system SHALL expose normalized, non-secret Codex runtime availability status without collapsing setup, auth, provider, MCP, and policy failures into a generic runtime failure.

#### Scenario: Bundled runtime component is unavailable
- **WHEN** the bundled Codex CLI is missing or non-executable, or the Codex app-server fails to start
- **THEN** the Codex runtime status identifies the failing component, local path when safe, sanitized error, and remediation hint
- **AND** the system blocks provider work until the failing runtime component is fixed

#### Scenario: Login or provider profile is unavailable
- **WHEN** Codex login is missing or expired
- **OR** the selected Codex provider profile is unavailable, invalid, or no longer allowed for Codex
- **THEN** the status distinguishes login-required from provider-profile-unavailable
- **AND** the renderer receives only non-secret identifiers, labels, availability, and remediation metadata

#### Scenario: MCP or policy blocker is detected
- **WHEN** a Codex run is blocked by MCP needs-auth, invalid MCP configuration, or a local-only policy guard
- **THEN** the runner emits a normalized status or error before provider work starts
- **AND** the status identifies the blocked component or policy without exposing credentials or raw request headers

### Requirement: Codex App-Server Desktop Adapter Decision Gate
The system SHALL keep `codex app-server` as the sole Codex desktop/chat adapter now that the ACP temporary-compat rollback is removed, and SHALL require a documented decision matrix before adding or replacing that adapter.

#### Scenario: Adapter replacement work starts
- **WHEN** implementation begins to add or replace the Codex desktop/chat adapter
- **THEN** the change records a matrix comparing the incumbent app-server adapter, `@openai/codex-sdk`, and any candidate transport
- **AND** the matrix covers provider-profile binding, MCP, approvals, AskUserQuestion, attachments, streaming, usage/context metadata, session resume/fork/rollback, cancellation, diagnostics, and local-only behavior
- **AND** `codex app-server` remains the desktop/chat default unless the matrix explicitly records a blocking gap and approved rescope
- **AND** a candidate is not selected as the desktop/chat default solely because it has an official package name

#### Scenario: ACP rollback is removed
- **WHEN** Codex desktop/chat starts after the ACP temporary-compat removal
- **THEN** there is no `codex-acp-temporary-compat` adapter source, no ACP selection env gate, and no bundled ACP runtime/binary dependency
- **AND** adapter selection always resolves `codex-app-server` with no rollback fallback
- **AND** removal does not upgrade any app-server capability state to `supported`, and existing degraded or unsupported states remain represented honestly

### Requirement: Codex Programmatic Surface Boundary
The system SHALL treat Codex SDK, Codex app-server, and `codex exec` as distinct Codex programmatic surfaces with separate capability states.

#### Scenario: Desktop and headless surfaces are displayed
- **WHEN** Locus shows or records Codex runtime metadata
- **THEN** it distinguishes desktop/chat adapter source from headless `codex exec` source
- **AND** it does not infer headless support from desktop adapter support or desktop support from headless `codex exec`
- **AND** each surface reports its own supported, degraded, and unsupported capability states

#### Scenario: Headless Codex remains on exec
- **WHEN** desktop/chat runs on app-server while headless Codex still uses `codex exec`
- **THEN** the headless path remains labeled as batch/fallback mode
- **AND** missing rich event, approval, or session primitives remain degraded or unsupported for headless until separately implemented and tested
