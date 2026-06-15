# agent-runtime-core Specification

## Purpose
TBD - created by archiving change add-headless-agent-jobs. Update Purpose after archive.
## Requirements
### Requirement: Agent Runtime Contract
The system SHALL define an explicit `AgentRuntime` contract implemented by every supported coding-agent runtime driver.

#### Scenario: Runtime is registered
- **WHEN** the application starts or runtime services initialize
- **THEN** each supported runtime registers a runtime ID, display metadata, a capability manifest sourced from `agent-runtime-capabilities`, run entry point, cancellation behavior, and session-reference behavior
- **AND** the registry rejects duplicate runtime IDs
- **AND** the renderer receives only non-secret runtime metadata and capability summaries

#### Scenario: Runtime-specific behavior is not forced into the contract
- **WHEN** a runtime lacks rollback, fork, workflows, plugins, runtime commands, or runtime-specific session operations
- **THEN** the `AgentRuntime` contract still allows the runtime to register for basic runs
- **AND** unsupported behavior remains behind capability gates
- **AND** callers do not require provider-specific features to satisfy the shared job contract

#### Scenario: Caller requests runtime capabilities
- **WHEN** a desktop, CLI, or main-process caller requests available runtime capabilities
- **THEN** the system returns the shared capability states for each registered runtime
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
- **AND** the capability IDs, states, scopes, reasons, and remediation hints remain owned by `add-agent-runtime-capability-model`

#### Scenario: UI gates behavior
- **WHEN** the desktop UI renders runtime-specific controls
- **THEN** it uses runtime capability states to enable, disable, warn, or hide behavior
- **AND** it does not assume Claude supports every feature or that Codex lacks every feature based only on runtime name

#### Scenario: CLI gates behavior
- **WHEN** a CLI caller requests a mode or option that depends on a runtime capability
- **THEN** the CLI validates the option against the selected runtime capability state before starting the run
- **AND** returns a normalized unsupported-capability error if the runtime cannot provide the requested behavior

#### Scenario: Capability is unsupported before job start
- **WHEN** a CLI or desktop job request includes options that require unsupported runtime behavior
- **THEN** the runner rejects the request before provider work starts
- **AND** no job is marked `running`
- **AND** any created job is marked `failed` with an unsupported-capability error or the request is rejected before job creation

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

#### Scenario: Cancellation is requested from another process
- **WHEN** a different local process requests cancellation for an active job
- **THEN** the active runner observes the persisted cancel request
- **AND** aborts the runtime through the shared abort mechanism when possible
- **AND** emits a canceled terminal event only after the runtime stop path completes

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

### Requirement: Default Observed Agent Control
The runtime core SHALL run normal desktop Agent-mode requests through an explicit observed control level by default.

#### Scenario: Unguarded Agent mode starts
- **WHEN** the user starts a desktop Agent-mode run without a scope contract or strict override
- **THEN** the resolved `PermissionPolicy` uses control level `observe`
- **AND** the runtime is allowed to continue normal supported actions
- **AND** catastrophic actions are loudly denied before execution when the selected runtime exposes a pre-tool hook for observed mode
- **AND** observable tool, shell, file, MCP, runtime, or provider actions are emitted as sanitized runtime events when the selected runtime exposes hooks or stream chunks
- **AND** the run remains cancelable through the shared abort mechanism

#### Scenario: Observed mode is not hard guard
- **WHEN** a run uses control level `observe`
- **THEN** the hard tool guard capability is not upgraded because of observation alone
- **AND** the run is not labeled as guarded or hard-enforced
- **AND** risky observed actions may be highlighted while still being allowed by default unless they match the explicit catastrophic denylist

#### Scenario: Runtime hook is unavailable
- **WHEN** the selected runtime cannot install a pre-tool observation hook for an observed Agent run
- **THEN** the run emits a renderer-safe degraded observation diagnostic
- **AND** the runtime may continue with stream-only visibility
- **AND** the diagnostic does not claim catastrophic pre-execution blocking, scope-contract enforcement, or hard guard support

#### Scenario: Observed mode blocks a catastrophic action
- **WHEN** an observed Agent-mode run requests a high-risk shell command, a write to a sensitive path, or a network-egress action classified as catastrophic by the guard owner
- **AND** the selected runtime exposes a pre-tool hook for observed mode
- **THEN** the action is denied before execution
- **AND** the runtime emits a sanitized event with control level, tool name, risk category, deny decision, and a renderer-safe explanation
- **AND** the denial is visible to the user rather than silently hidden

### Requirement: Observed Action Risk Metadata
The runtime core SHALL attach guard-owned risk metadata to observed tool and permission events.

#### Scenario: Runtime observes a tool action
- **WHEN** a runtime hook or stream chunk identifies a tool action during observed mode
- **THEN** the action event includes the control level, tool name, bounded action metadata, and a risk level derived from the guard owner
- **AND** raw provider secrets, raw environment values, raw headers, full file contents, and unbounded command output are not persisted or emitted to renderer state

#### Scenario: Runtime observes a high-risk shell command
- **WHEN** an observed tool action includes a high-risk or ambiguous shell command according to the guard-owned classifier
- **THEN** the event is tagged as high risk
- **AND** the default observed policy denies the action only when it matches the catastrophic denylist and the runtime exposes a pre-tool hook

#### Scenario: Runtime observes network egress
- **WHEN** an observed tool action may send project data to a network destination through web fetch, shell, MCP, runtime, or provider behavior
- **THEN** the event includes network-egress risk metadata derived from the guard owner
- **AND** the renderer can highlight the risk without owning a second network-egress classifier

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

#### Scenario: Plan mode is read-only for workspace side effects
- **WHEN** a desktop Claude or Codex run starts in plan mode
- **THEN** the `PermissionPolicy` disallows project or workspace file writes, side-effecting shell commands, MCP/runtime configuration mutation, and provider configuration writes before execution
- **AND** the app may still persist Locus-owned messages, job rows, semantic events, diagnostics, and session metadata
- **AND** any future Locus-owned artifact write requires an explicit owner, path policy, and tests rather than a route-local `.md` exception

#### Scenario: Claude native permission bypass is considered
- **WHEN** the Claude desktop adapter would use native permission bypass for agent or guarded behavior
- **THEN** the `PermissionPolicy` records the Locus-owned enforcement evidence required before runtime startup
- **AND** the run fails closed or uses native controls when guarded decisions, plan-mode enforcement, diagnostics, and tests cannot prove pre-execution side-effect control

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

