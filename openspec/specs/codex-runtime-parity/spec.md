# codex-runtime-parity Specification

## Purpose
TBD - created by archiving change upgrade-codex-runtime-parity. Update Purpose after archive.
## Requirements
### Requirement: Codex Runtime Parity Dependency
The system SHALL upgrade Codex parity on top of the shared `AgentRuntime` contract without blocking the headless jobs platform from shipping with honest capability states.

#### Scenario: Headless jobs depend on capability truth
- **WHEN** `add-headless-agent-jobs` registers Codex through the shared runtime registry
- **THEN** Codex may report `supported`, `degraded`, or `unsupported` for each capability
- **AND** desktop and CLI callers gate behavior from those states
- **AND** this parity change owns the work to turn parity-owned Codex capabilities into `supported` behavior

#### Scenario: Parity claim is attempted without implementation
- **WHEN** a Codex capability is marked `supported`
- **THEN** tests exercise the adapter or shared product layer that provides the behavior
- **AND** prompt-only instructions, UI labels, indexed documentation, or post-run audit alone do not satisfy the capability

### Requirement: Shared Codex Runtime Path
The system SHALL bring the existing desktop Codex chat path under the same capability and enforcement truth used by the shared Codex runtime adapter.

#### Scenario: Desktop Codex chat starts
- **WHEN** a user sends a Codex message from the interactive desktop chat
- **THEN** the request uses the shared `AgentRuntime` Codex adapter or a shared enforcement/status layer delegated by that adapter
- **AND** guarded runs, plan mode, scope expansion, AskUserQuestion, attachments, MCP auth, usage, and provider-profile behavior are decided from the same capability states as headless and CLI callers
- **AND** normalized runtime events or capability errors are emitted consistently enough for desktop and headless callers to test the same behavior

#### Scenario: Legacy Codex route bypass remains
- **WHEN** any desktop-only Codex router or ACP transport path can still execute a parity-owned capability through prompt-only instructions, read-only metadata, or post-run audit
- **THEN** that capability remains `degraded` or `unsupported`
- **AND** this change cannot mark it `supported` until the bypass is removed or delegated to shared enforcement

### Requirement: Core Safety Parity
The system SHALL provide Codex behavior equivalent to Claude Code for core safety capabilities before claiming Codex first-class runtime safety.

#### Scenario: Hard tool guard blocks before execution
- **WHEN** a Codex run has an approved guarded scope contract
- **AND** the runtime attempts a write, edit, shell, or file operation outside the approved scope
- **THEN** the Codex adapter denies or rewrites the tool call before the tool executes
- **AND** emits a normalized guard event with runtime ID, tool name, decision, and reason

#### Scenario: Plan mode blocks unsafe tools
- **WHEN** a Codex run is in plan mode
- **AND** the runtime attempts a blocked write, edit, notebook edit, or shell operation
- **THEN** the adapter denies the tool call before execution
- **AND** emits a normalized permission or guard event explaining the denial

#### Scenario: Scope expansion pauses before boundary crossing
- **WHEN** a Codex run attempts to read, write, execute, or inspect resources outside the approved project, workspace, or user-approved scope
- **THEN** the adapter pauses before crossing that boundary
- **AND** emits a normalized scope-expansion request with runtime ID, requested scope, reason, and affected operation
- **AND** does not continue the operation until the user or policy grants approval

#### Scenario: AskUserQuestion round trip completes
- **WHEN** Codex emits an AskUserQuestion request
- **THEN** the runner emits the same normalized pending-question event shape used by other runtimes
- **AND** the desktop UI can answer, deny, or let it time out without provider-specific question handling
- **AND** the adapter resumes or denies the run with normalized result events

#### Scenario: Rollback and fork use durable session references
- **WHEN** the user resumes, rolls back, or forks a Codex sub-chat from a prior assistant message
- **THEN** the next run uses durable session references through the shared runtime contract
- **AND** rollback excludes messages after the selected point
- **AND** forked sessions do not mutate the original session history

#### Scenario: Rollback and fork are not safely available
- **WHEN** Codex only exposes existing-session resume without a durable resume-at or fork primitive
- **THEN** Locus SHALL keep Codex rollback/fork capability `unsupported`
- **AND** SHALL NOT present Codex rollback/fork as runtime-neutral behavior
- **AND** SHALL require a later implementation or approved rescope before changing that capability to `supported`

#### Scenario: MCP auth blocks before provider work
- **WHEN** a Codex run would use an MCP server with known missing or expired authentication
- **THEN** the runner reports a normalized needs-auth state before starting provider work
- **AND** the agent run does not begin with that unauthenticated MCP server silently enabled

### Requirement: Codex Runtime Availability Status
The system SHALL expose normalized, non-secret Codex runtime availability status without collapsing setup, auth, provider, MCP, and policy failures into a generic runtime failure.

#### Scenario: Bundled runtime component is unavailable
- **WHEN** the bundled Codex CLI is missing, the bundled ACP runtime is missing or non-executable, or the ACP spawn probe fails
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

### Requirement: Runtime Feature Parity
The system SHALL provide Codex behavior equivalent to Claude-facing runtime-neutral feature surfaces or explicitly rescope those surfaces before claiming parity.

#### Scenario: MCP configuration scope is equivalent
- **WHEN** a user adds, removes, or lists MCP servers for a selected project, workspace, or global scope
- **THEN** Codex uses the requested scope without silently falling back to a different scope
- **AND** reports auth state and configuration source using normalized fields

#### Scenario: Codex MCP project-scoped writes are unavailable
- **WHEN** Codex can list/status MCP configuration but cannot safely add or remove project-scoped MCP servers through its runtime configuration layer
- **THEN** MCP configuration capability SHALL remain `degraded`
- **AND** project-scoped Codex add/remove operations SHALL fail explicitly instead of silently writing global configuration
- **AND** needs-auth MCP servers SHALL still block affected runs before provider work starts

#### Scenario: Provider profile and available usage metadata are equivalent
- **WHEN** a user selects a provider profile for Codex
- **THEN** the runtime adapter receives only the non-secret profile reference needed to start the run
- **AND** the renderer receives consistent non-secret runtime, model, profile availability, context, token, and usage metadata when available
- **AND** unavailable quota or usage fields are omitted rather than reported as zero

#### Scenario: Attachments are validated before provider work
- **WHEN** a user submits an image, long-text, or file-content context attachment to Codex
- **THEN** the runtime adapter validates whether that attachment type is supported before starting provider work
- **AND** supported attachments are passed through normalized attachment metadata
- **AND** unsupported generic file attachments fail or remain out of scope rather than being silently treated as supported Codex file parity

#### Scenario: Runtime plugins are executable when shown as executable
- **WHEN** a plugin is displayed as available and executable for Codex
- **THEN** the plugin entry includes capability state, install source, enablement state, and executable surfaces
- **AND** enable, disable, configure, or execute controls are visible only when Codex can actually perform the operation

#### Scenario: Runtime commands execute when shown as executable
- **WHEN** a command appears in chat, jobs, or command-guide UI as an executable Codex runtime command
- **THEN** Codex has a runtime command invocation path for that command category
- **AND** execution emits normalized command-started, command-output, command-finished, and error events

#### Scenario: Runtime workflows are implemented or rescoped
- **WHEN** a dynamic workflow surface is presented as runtime-neutral
- **THEN** Codex can execute the workflow through a runtime-native integration or shared Locus-owned workflow layer
- **AND** Claude-only workflow adapters are not counted as Codex workflow parity unless workflows are explicitly rescoped out of runtime-neutral parity

#### Scenario: Unsupported feature surfaces stay honest
- **WHEN** runtime plugins, runtime commands, runtime workflows, or App Agent runtime execution do not have Codex execution paths
- **THEN** those Codex capabilities SHALL remain `unsupported` or `degraded`
- **AND** read-only discovery, prompt-only injection, or Claude-only adapters SHALL NOT count as supported Codex feature parity

#### Scenario: App Agents and skills are equivalent
- **WHEN** a user selects an App Agent or skill for a Codex run
- **THEN** the selected instructions, metadata, and constraints are applied through the shared run request
- **AND** runtime-specific limitations remain visible in the capability state
- **AND** runtime-specific prompt injection alone is not the only tested behavior for parity

### Requirement: Codex Parity Completion Gate
The system SHALL fail this change's completion gate unless Codex parity-owned capabilities are implemented, tested, or explicitly rescoped.

#### Scenario: Completion validation runs
- **WHEN** completion validation runs for this change
- **THEN** Codex reports `supported` for implemented core safety parity capabilities and honest `unsupported` or `degraded` states for explicitly rescoped capabilities
- **AND** tests prove declared `supported` capabilities execute through Codex adapter or shared product enforcement paths
- **AND** tests or desktop smoke prove the interactive desktop Codex chat path cannot bypass parity-owned enforcement and status behavior
- **AND** feature parity capabilities are either `supported` with tests or explicitly removed from runtime-neutral parity scope by an approved OpenSpec rescope

#### Scenario: Degraded capability remains
- **WHEN** a parity-owned Codex capability remains `degraded` or `unsupported`
- **THEN** the change cannot be considered complete unless a separate approved rescope removes that capability from the parity requirement
- **AND** desktop and CLI surfaces continue to show the degraded or unsupported state honestly

### Requirement: Codex App-Server Desktop Adapter Decision Gate
The system SHALL require a documented decision matrix before replacing the current ACP Codex desktop/chat adapter with the app-server target or enabling any migration fallback.

#### Scenario: App-server adapter work starts
- **WHEN** implementation begins for a Codex app-server desktop/chat migration
- **THEN** the change records a matrix comparing the current ACP adapter, `@openai/codex-sdk`, and `codex app-server`
- **AND** the matrix covers provider-profile binding, MCP, approvals, AskUserQuestion, attachments, streaming, usage/context metadata, session resume/fork/rollback, cancellation, diagnostics, and local-only behavior
- **AND** `codex app-server` is treated as the desktop/chat target unless the matrix explicitly records a blocking gap and approved rescope
- **AND** `@openai/codex-sdk` is not selected as the desktop/chat default solely because it has an official package name

#### Scenario: ACP remains in temporary use
- **WHEN** Locus keeps the ACP-based Codex adapter during the app-server migration
- **THEN** runtime status and documentation identify ACP as the `temporary-compat` adapter
- **AND** Locus does not describe ACP as the long-term official OpenAI integration surface
- **AND** the fallback reason, default-disable condition, and removal condition are recorded in non-secret diagnostics or implementation notes
- **AND** fallback is selected only through an explicit adapter gate or migration flag, not silent app-server fallback
- **AND** ACP-supported behavior does not upgrade app-server capability states to `supported`

#### Scenario: ACP fallback is disabled after app-server proof
- **WHEN** app-server passes schema/client pinning, pre-execution fail-closed tests, provider-profile binding, MCP readiness, AskUserQuestion, supported attachment, stream/session/usage, cancellation, redaction, and desktop smoke evidence for required desktop behavior
- **THEN** ACP fallback defaults off for desktop Codex chat
- **AND** any remaining ACP route, dependency, or package path has an explicit approved compatibility gate and deletion follow-up

### Requirement: Codex App-Server Behavior Preservation
The system SHALL preserve existing Codex desktop/chat safety and runtime behavior when migrating to app-server, or explicitly rescope unavailable behavior before enabling app-server by default.

#### Scenario: App-server is enabled for desktop chat
- **WHEN** the Codex app-server adapter handles a desktop chat run
- **THEN** provider-profile binding, MCP readiness, plan-mode enforcement, guarded-run permission handling, AskUserQuestion, supported attachments, streaming output, usage/session metadata, and cancellation are preserved where previously supported
- **AND** unsupported or degraded behavior is represented through the Codex capability manifest before provider work starts
- **AND** tests cover each capability changed to or kept as `supported`

#### Scenario: App-server lacks a required safety primitive
- **WHEN** the Codex app-server adapter cannot install approval, permission, plan-mode, or guarded-run enforcement before execution
- **THEN** guarded or plan-mode Codex runs fail closed or fall back to a supported adapter according to explicit policy
- **AND** the system emits a renderer-safe unsupported-capability or fallback diagnostic
- **AND** the capability is not marked `supported` for that adapter

### Requirement: Codex App-Server Pre-Execution Safety
The system SHALL prove that the Codex app-server adapter can enforce Locus safety decisions before tool, shell, file, or MCP side effects occur.

#### Scenario: Permission interception is unavailable
- **WHEN** a Codex run requires plan-mode or guarded-run enforcement
- **AND** the app-server adapter does not expose a verified pre-execution permission or approval callback
- **THEN** the run fails closed before provider work starts or uses an explicitly supported fallback adapter
- **AND** the runtime capability state remains `degraded` or `unsupported` for that adapter

#### Scenario: Permission interception is installed late
- **WHEN** adapter startup cannot prove the permission or approval callback is installed before the first model/tool turn
- **THEN** the run fails before the first tool request can execute
- **AND** the diagnostic explains the adapter safety setup failure without exposing secrets

### Requirement: Codex Programmatic Surface Boundary
The system SHALL treat Codex SDK, Codex app-server, ACP, and `codex exec` as distinct Codex programmatic surfaces with separate capability states.

#### Scenario: Desktop and headless surfaces are displayed
- **WHEN** Locus shows or records Codex runtime metadata
- **THEN** it distinguishes desktop/chat adapter source from headless `codex exec` source
- **AND** it does not infer headless support from desktop adapter support or desktop support from headless `codex exec`
- **AND** each surface reports its own supported, degraded, and unsupported capability states

#### Scenario: Headless Codex remains on exec
- **WHEN** desktop/chat migrates to app-server while headless Codex still uses `codex exec`
- **THEN** the headless path remains labeled as batch/fallback mode
- **AND** missing rich event, approval, or session primitives remain degraded or unsupported for headless until separately implemented and tested

