## ADDED Requirements

### Requirement: Agent Runtime Contract
The system SHALL define an explicit `AgentRuntime` contract implemented by every supported coding-agent runtime driver.

#### Scenario: Runtime is registered
- **WHEN** the application starts or runtime services initialize
- **THEN** each supported runtime registers a runtime ID, display metadata, capability manifest, run entry point, cancellation behavior, and session-reference behavior
- **AND** the registry rejects duplicate runtime IDs
- **AND** the renderer receives only non-secret runtime metadata and capability summaries

#### Scenario: Caller requests runtime capabilities
- **WHEN** a desktop, CLI, or main-process caller requests available runtime capabilities
- **THEN** the system returns capability states for each registered runtime
- **AND** each capability state is explicit as `supported`, `degraded`, or `unsupported`
- **AND** degraded or unsupported states include a short reason when practical

#### Scenario: Runtime declares support
- **WHEN** a runtime declares a capability as `supported`
- **THEN** the adapter enforces or provides that behavior through runtime code
- **AND** tests cover the declared behavior or fail the implementation checklist

### Requirement: Runtime Capability Model
The system SHALL model runtime behavior through capabilities rather than hard-coded provider-name assumptions.

#### Scenario: Capability set is exposed
- **WHEN** runtime capabilities are resolved
- **THEN** the capability set includes hard tool guard, plan mode enforcement, scope expansion approval, AskUserQuestion, rollback/fork, MCP auth, MCP configuration scope, provider profiles, attachments, usage metadata, runtime plugins, runtime commands, runtime workflows, and App Agents/skills
- **AND** additional capabilities can be added without changing existing capability semantics

#### Scenario: UI gates behavior
- **WHEN** the desktop UI renders runtime-specific controls
- **THEN** it uses runtime capability states to enable, disable, warn, or hide behavior
- **AND** it does not assume Claude supports every feature or that Codex lacks every feature based only on runtime name

#### Scenario: CLI gates behavior
- **WHEN** a CLI caller requests a mode or option that depends on a runtime capability
- **THEN** the CLI validates the option against the selected runtime capability state before starting the run
- **AND** returns a normalized unsupported-capability error if the runtime cannot provide the requested behavior

### Requirement: Capability Honesty
The runtime core SHALL distinguish supported behavior from degraded or unsupported behavior.

#### Scenario: Runtime supports hard tool guard
- **WHEN** a runtime reports hard tool guard as `supported`
- **THEN** the adapter can allow, deny, or rewrite a tool call before the tool executes
- **AND** the runner emits permission or guard events when a tool decision is made

#### Scenario: Runtime lacks pre-tool interception
- **WHEN** a runtime cannot enforce allow, deny, or rewrite decisions before tool execution
- **THEN** the hard tool guard capability is reported as `degraded` or `unsupported`
- **AND** guarded agent-mode UI and CLI behavior do not present that runtime as having hard enforcement
- **AND** prompt-only guidance and post-run audit may still be used when clearly represented as degraded protection

#### Scenario: Codex capability is missing
- **WHEN** Codex cannot provide a capability that Claude supports
- **THEN** the Codex capability manifest marks that capability as `degraded` or `unsupported`
- **AND** the app shows appropriate UI state or CLI diagnostics
- **AND** the missing capability is testable from the runtime registry rather than hidden in provider-specific branches
- **AND** this headless jobs change may still complete if callers correctly gate the missing capability

### Requirement: Runtime-Neutral Agent Runner
The system SHALL provide a main-process runtime-neutral agent runner that can execute supported coding-agent runtimes through a shared request, event, cancellation, and result contract.

#### Scenario: Run Claude through shared runner
- **WHEN** a caller submits a valid agent run request with runtime `claude`
- **THEN** the runner executes the task through the Claude adapter
- **AND** emits normalized events instead of runtime-specific stream objects
- **AND** returns a normalized result with final status, exit information, and session metadata when available

#### Scenario: Run Codex through shared runner
- **WHEN** a caller submits a valid agent run request with runtime `codex`
- **THEN** the runner executes the task through the Codex adapter when the requested mode and options are supported by Codex capabilities
- **AND** emits normalized events instead of runtime-specific stream objects
- **AND** returns a normalized result with final status, exit information, and session metadata when available

#### Scenario: Unsupported runtime requested
- **WHEN** a caller submits a run request for an unsupported runtime
- **THEN** the runner rejects the request before starting provider work
- **AND** returns a normalized unsupported-runtime error

#### Scenario: Unsupported capability requested
- **WHEN** a caller requests a run mode, option, or tool policy that the selected runtime reports as `degraded` or `unsupported`
- **THEN** the runner rejects or downgrades the request according to explicit caller policy before starting provider work
- **AND** emits a normalized unsupported-capability diagnostic

### Requirement: Normalized Agent Events
The system SHALL normalize runtime output into ordered events that can be persisted, streamed, and later mapped to protocol clients.

#### Scenario: Event type is emitted
- **WHEN** the runner emits a runtime event
- **THEN** the event type is one of `job_created`, `job_started`, `assistant_delta`, `reasoning_delta`, `tool_started`, `tool_delta`, `tool_finished`, `guard_decision`, `permission_requested`, `scope_expansion_requested`, `question_pending`, `question_result`, `mcp_needs_auth`, `usage_update`, `command_started`, `command_output`, `command_finished`, `status`, `error`, or `completed`
- **AND** the event includes a sequence number and sanitized payload

#### Scenario: Runtime emits assistant output
- **WHEN** a runtime produces assistant text, reasoning, or structured content
- **THEN** the runner emits ordered assistant-output events with sequence numbers
- **AND** preserves enough metadata for desktop and CLI renderers to display the output consistently

#### Scenario: Runtime emits tool activity
- **WHEN** a runtime starts, updates, or completes a tool call
- **THEN** the runner emits ordered tool events with tool name, status, and sanitized payload metadata
- **AND** does not include provider secrets in the event payload

#### Scenario: Runtime reports completion
- **WHEN** a runtime finishes successfully, fails, is canceled, or is interrupted
- **THEN** the runner emits a terminal event with final status
- **AND** no later non-diagnostic event is emitted for that run

#### Scenario: Event is serialized for CLI
- **WHEN** a normalized event is written in `stream-json` mode
- **THEN** stdout receives one newline-delimited JSON object for that event
- **AND** non-event diagnostics are written to stderr

### Requirement: Shared Cancellation Semantics
The system SHALL support cancellation through a shared abort mechanism across supported runtimes.

#### Scenario: Caller cancels active run
- **WHEN** a caller cancels an active agent run
- **THEN** the runner signals the runtime adapter to stop work
- **AND** emits a canceled terminal event
- **AND** releases runtime resources associated with the run

#### Scenario: Caller cancels completed run
- **WHEN** a caller cancels a run that already reached a terminal status
- **THEN** the runner treats the request as idempotent
- **AND** does not create a new runtime operation

### Requirement: Credential and Local-Only Boundaries
The runtime core SHALL preserve existing local-first and credential boundaries.

#### Scenario: CLI caller starts a run
- **WHEN** a CLI caller starts a run
- **THEN** provider tokens are resolved through existing local credential or provider-profile mechanisms
- **AND** plaintext provider tokens are not accepted as CLI flags
- **AND** plaintext provider tokens are not included in runner events

#### Scenario: Local-only mode blocks hosted upstream
- **WHEN** local-only mode blocks an official hosted upstream path
- **THEN** the runner returns a normalized local-only error
- **AND** does not bypass the guard because the caller is headless or CLI-based
