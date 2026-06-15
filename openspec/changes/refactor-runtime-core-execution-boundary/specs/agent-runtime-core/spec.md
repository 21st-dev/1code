## ADDED Requirements
### Requirement: Shared Run Request Base
The runtime core SHALL define a shared run request base for fields common to
desktop, CLI, daemon, schedule, protocol, and Local Job API runtime execution.

#### Scenario: Shared request is created
- **WHEN** a runtime run is started from any supported surface
- **THEN** the request includes run identity, runtime ID, mode, cwd, prompt,
  cancellation signal, source or surface, requested capabilities, permission
  policy summary, provider reference metadata, and an event observer
- **AND** the request excludes plaintext provider secrets, OAuth tokens,
  gateway tokens, raw headers, and arbitrary caller-supplied environment values

#### Scenario: Surface-specific context is preserved
- **WHEN** a desktop Workbench run is started
- **THEN** desktop-only context such as chat ID, sub-chat ID, MCP readiness,
  attachment references, session metadata, trace observer, and interactive
  bridges remains in the desktop request extension
- **AND** headless/API callers are not required to fabricate desktop-only fields

#### Scenario: Headless job context is preserved
- **WHEN** a CLI, daemon, schedule, protocol, or Local Job API job is started
- **THEN** job/source/consumer/artifact context remains available to the
  headless request extension
- **AND** the run does not claim a visible user interaction channel unless one
  is explicitly provided

### Requirement: Non-Desktop Permission Policy
The runtime core SHALL resolve permission policy for non-desktop runtime runs
before adapter selection and provider work.

#### Scenario: Headless run has no user
- **WHEN** a CLI, daemon, schedule, protocol, or Local Job API run lacks a
  visible user interaction channel
- **THEN** the policy resolves to `policy-grant` only when the request declares
  bounded scopes that the policy can decide automatically
- **AND** otherwise resolves interactive-only side-effect requests to
  `fail-closed`

#### Scenario: Policy grant scopes are not silently overclaimed
- **WHEN** a non-desktop run declares policy-grant scopes
- **THEN** the permission policy records those scopes as non-desktop grant
  metadata without claiming the selected adapter binds every declared scope
- **AND** an adapter that only provides an app-server admission gate may be
  selected only with an explicit admission/audit diagnostic
- **AND** guarded scope contracts and hard-tool guard requests still require a
  true pre-execution hook or fail closed before provider work starts

#### Scenario: Interactive user is present
- **WHEN** a desktop run or future approved interactive headless channel
  provides a user interaction bridge
- **THEN** the policy may use `interactive-user`
- **AND** approval, question, and MCP elicitation requests are routed through
  the declared bridge rather than silently bypassed

## MODIFIED Requirements
### Requirement: Capability Honesty
The runtime core SHALL distinguish supported behavior from degraded or
unsupported behavior.

#### Scenario: Runtime supports hard tool guard
- **WHEN** a runtime reports hard tool guard as `supported`
- **THEN** the adapter can allow, deny, or rewrite a tool call before the tool
  executes
- **AND** the runner emits permission or guard events when a tool decision is
  made

#### Scenario: Runtime lacks pre-tool interception
- **WHEN** a runtime cannot enforce allow, deny, or rewrite decisions before tool
  execution
- **THEN** the hard tool guard capability is reported as `degraded` or
  `unsupported`
- **AND** guarded agent-mode UI and CLI behavior do not present that runtime as
  having hard enforcement
- **AND** prompt-only guidance and post-run audit may still be used when clearly
  represented as degraded protection

#### Scenario: Codex capability is missing
- **WHEN** Codex cannot provide a capability that Claude supports
- **THEN** the Codex capability manifest marks that capability as `degraded` or
  `unsupported`
- **AND** the app shows appropriate UI state or CLI diagnostics
- **AND** the missing capability is testable from the runtime registry rather
  than hidden in provider-specific branches
- **AND** runtime execution boundary changes may still complete when callers
  correctly gate the missing capability

#### Scenario: Policy grant requires adapter enforcement
- **WHEN** a non-desktop run requests policy-grant behavior on an adapter that
  lacks a pre-execution hook for the requested side-effect scope
- **THEN** the runtime does not claim per-scope pre-execution enforcement for
  that adapter
- **AND** the selector either limits the run to a documented admission/audit
  gate, limits enforcement to documented sandbox-level controls, or fails
  closed before provider work starts
- **AND** emits a sanitized diagnostic that distinguishes admission/audit-only
  policy grants from declared-scope-bound enforcement

### Requirement: Runtime-Neutral Agent Runner
The system SHALL provide a main-process runtime-neutral agent runner that
selects supported coding-agent runtime adapters through an execution selector
and executes them through a shared request, event, cancellation, and result
contract.

#### Scenario: Run Claude through shared runner
- **WHEN** a caller submits a valid agent run request with runtime `claude`
- **THEN** the selector chooses a Claude adapter source whose capabilities and
  permission policy satisfy the request
- **AND** the runner executes the task through that selected adapter
- **AND** emits normalized events instead of runtime-specific stream objects
- **AND** returns a normalized result with final status, exit information, and
  session metadata when available

#### Scenario: Run Codex through shared runner
- **WHEN** a caller submits a valid agent run request with runtime `codex`
- **THEN** the selector chooses a Codex adapter source whose capabilities and
  permission policy satisfy the request
- **AND** the runner executes the task through that selected adapter
- **AND** emits normalized events instead of runtime-specific stream objects
- **AND** returns a normalized result with final status, exit information, and
  session metadata when available

#### Scenario: Default headless batch runtime is selected
- **WHEN** a headless/API run requests the default batch profile for Codex or
  Claude
- **THEN** the selector chooses the existing process-backed batch adapter when
  required capabilities and permission policy allow it
- **AND** the selection diagnostic identifies the adapter source without
  exposing secrets

#### Scenario: Interactive runtime is requested without interaction
- **WHEN** a headless/API run requests an adapter that requires user approval,
  AskUserQuestion, MCP elicitation, or other interactive callbacks
- **AND** the request does not provide an approved interactive channel or policy
  grant
- **THEN** the selector refuses the adapter before provider work starts
- **AND** the run receives a sanitized fail-closed diagnostic

#### Scenario: Adapter selection falls back
- **WHEN** the selector falls back from a preferred adapter to a supported batch
  adapter
- **THEN** the selector records the selected adapter source and fallback reason
  in the normalized selection result
- **AND** published adapter metadata and diagnostics remain governed by the
  runtime adapter source metadata requirement
- **AND** the fallback does not silently upgrade degraded or unsupported
  capabilities to supported

#### Scenario: Unsupported runtime requested
- **WHEN** a caller submits a run request for an unsupported runtime
- **THEN** the runner rejects the request before starting provider work
- **AND** returns a normalized unsupported-runtime error

#### Scenario: Unsupported capability requested
- **WHEN** a caller requests a run mode, option, or tool policy that the selected
  runtime reports as `degraded` or `unsupported`
- **THEN** the runner rejects or downgrades the request according to explicit
  caller policy before starting provider work
- **AND** emits a normalized unsupported-capability diagnostic

### Requirement: Normalized Agent Events
The system SHALL normalize runtime output into ordered canonical `RunEvent`
records that can be persisted, streamed, and later mapped to protocol, CLI,
desktop, and Local Job API clients.

#### Scenario: Event type is emitted
- **WHEN** the runner emits a runtime event
- **THEN** the event type is one of `job_created`, `job_started`,
  `assistant_delta`, `reasoning_delta`, `tool_started`, `tool_delta`,
  `tool_finished`, `guard_decision`, `permission_requested`,
  `scope_expansion_requested`, `question_pending`, `question_result`,
  `mcp_needs_auth`, `usage_update`, `command_started`, `command_output`,
  `command_finished`, `status`, `error`, or `completed`
- **AND** the event includes a sequence number and sanitized payload

#### Scenario: Runtime emits assistant output
- **WHEN** a runtime produces assistant text, reasoning, or structured content
- **THEN** the runner emits ordered assistant-output events with sequence
  numbers
- **AND** preserves enough metadata for desktop and CLI renderers to display the
  output consistently

#### Scenario: Runtime emits tool activity
- **WHEN** a runtime starts, updates, or completes a tool call
- **THEN** the runner emits ordered tool events with tool name, status, and
  sanitized payload metadata
- **AND** does not include provider secrets in the event payload

#### Scenario: Runtime reports completion
- **WHEN** a runtime finishes successfully, fails, is canceled, or is interrupted
- **THEN** the runner emits a terminal event with final status
- **AND** no later non-diagnostic event is emitted for that run

#### Scenario: Event is serialized for CLI
- **WHEN** a normalized event is written in `stream-json` mode
- **THEN** stdout receives one newline-delimited JSON object for that event
- **AND** non-event diagnostics are written to stderr

#### Scenario: Headless process emits coarse output
- **WHEN** a headless process-backed adapter emits assistant text, command
  lifecycle output, status, error, or completion information
- **THEN** the runtime maps that output into ordered `RunEvent` records with
  sanitized payloads
- **AND** job persistence receives events through the canonical runtime event
  bridge instead of a separate unredacted event path

#### Scenario: Event compatibility is required
- **WHEN** an existing CLI, protocol, or Local Job API v1 caller reads job events
- **THEN** the system maps canonical runtime events into the documented event
  envelope for that surface
- **AND** existing v1 consumers do not need to parse raw `RunEvent` internals

### Requirement: Desktop Run Request Contract
The runtime core SHALL define a desktop-capable run request, event,
cancellation, and result contract for desktop Claude and Codex adapters that
extends the shared run request base.

#### Scenario: Adapter receives desktop request
- **WHEN** a desktop runtime adapter is invoked
- **THEN** it receives a `DesktopRunRequest` containing run identity, verified
  context, provider binding metadata, permission policy, MCP readiness,
  attachment references, trace observer, cancellation signal, and session
  metadata
- **AND** the request excludes plaintext provider secrets, OAuth tokens, gateway
  tokens, raw headers, and arbitrary renderer-supplied env

#### Scenario: Adapter emits normalized events
- **WHEN** a runtime-specific stream emits assistant, reasoning, tool, guard,
  permission, question, MCP, usage, status, error, cancellation, or completion
  information
- **THEN** the adapter maps it into ordered `RunEvent` records with sanitized
  payloads
- **AND** callers do not need runtime-specific stream objects to persist or
  display the trace
