# agent-scope-contracts Specification

## Purpose
TBD - created by archiving change add-agent-scope-contract. Update Purpose after archive.
## Requirements
### Requirement: Guarded Run Scope Contract
The system SHALL provide a user-confirmed scope contract for guarded local agent runs.

#### Scenario: User approves a guarded run contract
- **WHEN** the user starts a guarded run from a local project chat
- **AND** the draft contract contains at least one editable scope entry
- **AND** the user approves the contract
- **THEN** the system freezes the approved contract for that run
- **AND** associates it with the chat, sub-chat, runtime, project path, and run id

#### Scenario: User attempts guarded run without editable scope
- **WHEN** the user tries to start a guarded Agent-mode run with no editable scope
- **THEN** the system blocks the run before invoking the runtime
- **AND** explains that at least one editable file, directory, or glob must be approved

#### Scenario: User chooses not to use a guard
- **WHEN** the user chooses the explicit run-without-guard action for a quick task
- **THEN** the system may send the request through the normal runtime path
- **AND** the request is not labeled as a guarded run

### Requirement: Contract Suggestions Require Confirmation
The system SHALL allow contract drafts to be seeded from local context while requiring explicit user confirmation before enforcement.

#### Scenario: Contract is seeded from a plan
- **WHEN** the user creates a guarded run from a Plan-mode summary
- **THEN** the system may suggest editable scope, read-only evidence, and success checks from the plan text
- **AND** each suggested entry remains editable before approval
- **AND** the runtime is not invoked until the user approves the contract

#### Scenario: Contract is seeded from selected context
- **WHEN** the user has selected files, changed files, GitHub context, or explicit file mentions
- **THEN** the system may add those items to a draft contract with visible source labels
- **AND** the user may remove or edit them before approval

### Requirement: Main-Process Contract Validation
The system SHALL validate approved scope contracts in the main process before invoking a runtime.

#### Scenario: Contract contains invalid path
- **WHEN** an approved contract contains an absolute path, parent traversal, empty path, null byte, or path outside the selected project root
- **THEN** the main process rejects the contract
- **AND** the runtime is not invoked

#### Scenario: Contract targets sensitive local files
- **WHEN** an approved contract includes sensitive files such as environment files, private keys, credential stores, or app data directories
- **THEN** the main process rejects those entries
- **AND** the user sees a clear explanation that the path is not allowed for guarded runs

#### Scenario: Contract is valid
- **WHEN** all contract paths normalize inside the selected project or worktree
- **AND** no blocked or sensitive paths are included
- **THEN** the main process accepts the contract for runtime dispatch

### Requirement: Runtime Contract Delivery
The system SHALL deliver the approved scope contract to supported runtime paths using a runtime-neutral metadata shape.

#### Scenario: Claude Code receives a guarded run
- **WHEN** the user starts a guarded run with Claude Code selected
- **THEN** the Claude chat transport sends the approved scope contract to the main process
- **AND** the Claude router associates that contract with the runtime invocation

#### Scenario: Codex receives a guarded run
- **WHEN** the user starts a guarded run with Codex selected
- **THEN** the Codex chat transport sends the approved scope contract to the main process
- **AND** the Codex router validates the contract before invoking Codex

#### Scenario: Runtime does not support hard enforcement
- **WHEN** the selected runtime cannot expose a pre-execution tool permission hook
- **THEN** the system still delivers the contract as prompt-visible context
- **AND** labels the run as audit-only instead of hard-enforced

### Requirement: Claude Tool Guard Enforcement
The system SHALL hard-enforce approved scope contracts for Claude Code tool calls that can modify files or run shell commands.

#### Scenario: Claude edits an approved file
- **WHEN** Claude Code requests a write-like tool for a path inside the approved editable scope
- **THEN** the guard allows the tool call
- **AND** records an allowed guard event for the run audit

#### Scenario: Claude edits outside scope
- **WHEN** Claude Code requests a write-like tool for a path outside the approved editable scope
- **THEN** the guard denies the tool call before execution
- **AND** records a blocked guard event with the requested path and tool name

#### Scenario: Claude uses unknown write-like tool
- **WHEN** Claude Code requests a tool that is not classified and may modify files or external state
- **THEN** the guard denies the tool call by default
- **AND** records that the tool needs classification before guarded runs may use it

### Requirement: Bash Command Guardrails
The system SHALL apply conservative command guardrails for shell commands in guarded runs.

#### Scenario: Claude runs approved success check
- **WHEN** Claude Code requests a shell command that exactly matches an approved success check
- **THEN** the guard allows the command
- **AND** records it as a verification command candidate

#### Scenario: Claude runs destructive command
- **WHEN** Claude Code requests a command containing destructive git operations, force push, publish/deploy actions, privilege escalation, pipe-to-shell patterns, or secret inspection
- **THEN** the guard denies the command before execution
- **AND** records a blocked guard event with a high-risk reason

#### Scenario: Claude runs ambiguous command
- **WHEN** Claude Code requests a command with shell control or redirection operators that is not an exact approved success check
- **THEN** the guard denies the command
- **AND** explains that guarded runs require explicit approval for that command

### Requirement: Scope Expansion Approval
The system SHALL require user approval before a running guarded run expands editable scope or success checks.

#### Scenario: Runtime requests additional editable path
- **WHEN** a runtime attempts to modify a path outside the approved editable scope
- **THEN** the system creates a scope-expansion request with the path, tool name, and reason
- **AND** the user can approve or reject the request

#### Scenario: User approves scope expansion
- **WHEN** the user approves a scope-expansion request
- **THEN** the system appends the approved path or success check to the run contract
- **AND** records the expansion in the run audit

#### Scenario: User rejects scope expansion
- **WHEN** the user rejects a scope-expansion request
- **THEN** the system keeps the original contract unchanged
- **AND** records the rejected expansion in the run audit

### Requirement: Codex Contract And Audit Mode
The system SHALL support Codex guarded runs through contract delivery and post-run audit until hard tool enforcement is available.

#### Scenario: Codex guarded run starts
- **WHEN** a guarded run starts with Codex selected
- **THEN** the system injects a deterministic guarded-run contract block into the Codex request
- **AND** captures pre-run git status for post-run comparison

#### Scenario: Codex changes only approved files
- **WHEN** a Codex guarded run finishes
- **AND** all changed files are inside approved or expanded editable scope
- **THEN** the system marks the audit as scope-respected
- **AND** shows that Codex used contract-and-audit mode

#### Scenario: Codex changes out-of-scope files
- **WHEN** a Codex guarded run finishes
- **AND** one or more changed files are outside approved or expanded editable scope
- **THEN** the system marks the audit as drifted or needs-review
- **AND** lists the out-of-scope changed files for review

### Requirement: Guarded Run Audit Summary
The system SHALL produce a user-visible audit summary for every guarded run.

#### Scenario: Guarded run finishes successfully
- **WHEN** a guarded run completes
- **THEN** the assistant response shows a compact audit summary
- **AND** the summary includes runtime, enforcement mode, changed files, blocked events, scope expansions, verification commands, and final status

#### Scenario: Guarded run is stopped or fails
- **WHEN** a guarded run is stopped, errors, or loses runtime connection
- **THEN** the system records a partial audit summary
- **AND** includes any changed files and guard events observed before termination

#### Scenario: User opens audit details
- **WHEN** the user expands a guarded run audit
- **THEN** the UI shows a linear event trace with allowed tools, blocked tools, scope expansion decisions, and verification results when available

### Requirement: Pending Changes Review
The system SHALL classify post-run file changes against the approved contract and make review actions available.

#### Scenario: Guarded run changes files
- **WHEN** a guarded run finishes with local file changes
- **THEN** the system classifies each changed file as in-scope, expanded-scope, or out-of-scope
- **AND** links changed files to the existing diff or review surface

#### Scenario: Worktree is dirty before run
- **WHEN** the project or worktree has unrelated dirty files before a guarded run starts
- **THEN** the system warns that post-run audit may be ambiguous
- **AND** allows the user to cancel, continue, or review dirty files first

#### Scenario: No files changed
- **WHEN** a guarded run finishes without local file changes
- **THEN** the audit summary states that no files changed
- **AND** does not mark the run as needs-review because of changed-file state

### Requirement: Checkpoint And Rollback Safety
The system SHALL only offer checkpoint or rollback actions when local git state makes them safe and user-confirmed.

#### Scenario: Checkpoint is available
- **WHEN** the project is a git repository and the pre-run state can be captured safely
- **THEN** the system may expose a checkpoint or rollback action for the guarded run
- **AND** the action requires explicit user confirmation before changing files

#### Scenario: Rollback is unsafe
- **WHEN** unrelated dirty files or ambiguous pre-run state prevent safe rollback
- **THEN** the system disables rollback
- **AND** explains why the user should use manual diff review instead

### Requirement: Local-First Boundary
Guarded runs SHALL preserve Locus local-first and credential boundaries.

#### Scenario: Local-only mode is enabled
- **WHEN** a guarded run starts in the default local-first build
- **THEN** the system may read local project files, local git state, local SQLite state, and user-selected GitHub context
- **AND** it does not initialize hosted upstream auth, remote sandbox, hosted chat, telemetry, inbox, automations, or hosted update services

#### Scenario: Renderer sends contract metadata
- **WHEN** renderer code sends a scope contract to the main process
- **THEN** the main process treats it as untrusted input
- **AND** revalidates paths, commands, and run identifiers before runtime execution

#### Scenario: Guard metadata is logged or persisted
- **WHEN** the system logs or persists guard metadata
- **THEN** it stores ids, relative paths, tool names, decisions, status, and bounded summaries
- **AND** it does not store provider secrets, full file contents, or unbounded command output in guard metadata

### Requirement: Guarded And Observed Control Separation
The system SHALL keep observed Agent-mode runs separate from guarded scope-contract runs.

#### Scenario: User starts observed Agent mode
- **WHEN** the user starts normal Agent mode without approving a guarded scope contract
- **THEN** the system uses observed control semantics
- **AND** no scope contract is created implicitly
- **AND** the run does not produce guarded-run audit claims such as scope-respected or hard-enforced

#### Scenario: User starts guarded Agent mode
- **WHEN** the user approves a guarded scope contract before Agent-mode execution
- **THEN** the system uses guarded control semantics
- **AND** existing scope-contract validation, enforcement, scope expansion, and audit behavior still apply

#### Scenario: Observed run has risky actions
- **WHEN** an observed run performs risky write, shell, MCP, runtime, or provider-related actions
- **THEN** the system may show risk-highlighted observed events
- **AND** those events are not treated as blocked guard events unless a guarded or strict policy made a deny decision
- **AND** observed-mode catastrophic denials are labeled as observed safety denials rather than guarded scope-contract denials

### Requirement: Scope Contracts Feed Permission Policy
The system SHALL convert approved scope contracts into runtime permission policy before desktop runtime startup.

#### Scenario: Guarded desktop run starts
- **WHEN** a Claude or Codex desktop run has an approved guarded scope contract
- **THEN** the runtime control layer includes the approved editable paths, denied sensitive paths, allowed success checks, and expansion policy in the resolved `PermissionPolicy`
- **AND** the selected adapter receives the policy before it can start tool, shell, file, or MCP side-effect work

#### Scenario: Scope enforcement is unavailable
- **WHEN** the selected adapter cannot enforce the approved scope contract before side effects
- **THEN** guarded desktop agent mode fails closed or uses an explicitly supported fallback adapter before provider work starts
- **AND** prompt-only instructions or post-run audit alone do not satisfy guarded scope enforcement

### Requirement: Scope Expansion Uses Runtime-Neutral Response Path
The system SHALL route desktop scope expansion requests through a runtime-neutral owner rather than a Claude-only route.

#### Scenario: Runtime requests scope expansion
- **WHEN** Claude or Codex requests expanded editable scope or success checks during a guarded desktop run
- **THEN** the request is persisted and emitted as a normalized scope-expansion event
- **AND** the user response is routed through a runtime-neutral response path or the runtime is marked degraded/retry-only before provider work starts

### Requirement: Codex App-Server Scope Contract Enforcement
The system SHALL preserve agent scope contract enforcement when Codex desktop/chat uses the app-server adapter.

#### Scenario: App-server runs with a guarded scope contract
- **WHEN** a Codex desktop/chat run uses app-server and has an approved guarded scope contract
- **THEN** the adapter or a Locus-owned shared layer enforces write, shell, file, and MCP side-effect decisions before execution
- **AND** out-of-scope operations emit normalized guard or scope-expansion events
- **AND** prompt-only guidance or post-run audit alone does not satisfy the guarded scope contract

#### Scenario: App-server cannot enforce the scope contract
- **WHEN** the app-server adapter cannot prove pre-execution enforcement for guarded scope decisions
- **THEN** guarded Codex runs fail closed or use an explicitly supported fallback adapter
- **AND** the UI, jobs, and protocol surfaces do not present guarded Codex agent mode as supported for that adapter

### Requirement: Locus-Controlled Edit Adoption Probe
The system SHALL prove Codex app-server model adoption of a Locus-owned structured edit tool for each auth/provider path before enabling that path for productive controlled edit execution.

#### Scenario: Direct auth model adopts Locus edit tool
- **WHEN** a direct-auth Codex app-server guarded run has a ready `locus_edit` MCP tool
- **AND** guarded shell writes are denied
- **AND** the user asks for an in-scope file edit using natural task language that does not name `locus_edit`, prescribe a shell command, or prescribe a patch format
- **AND** the prompt is either natural zero-prompt text or a light generic structured-editing hint that does not name `locus_edit`
- **THEN** the adoption probe records a `locus_edit.propose_file_edit` tool call
- **AND** the tool call includes a relative path inside the approved editable scope
- **AND** the probe records proposed content or a proposed patch
- **AND** the probe does not write to the filesystem
- **AND** the evidence classifies the adoption as `zero-prompt` or `light-hint`
- **AND** the executor may proceed only for auth/provider paths with this proof

#### Scenario: Model only adopts Locus edit tool when named explicitly
- **WHEN** a Codex app-server guarded run calls `locus_edit.propose_file_edit` only after the prompt names `locus_edit` or prescribes the exact tool call
- **THEN** the evidence classifies the result as `explicit-tool-name-only`
- **AND** that auth/provider path remains degraded for productive controlled edits
- **AND** the result does not count as adoption proof for enabling that path

#### Scenario: Model does not adopt Locus edit tool
- **WHEN** a Codex app-server guarded run keeps trying shell writes, refuses to edit, or answers without calling `locus_edit`
- **THEN** that auth/provider path remains degraded for productive controlled edits
- **AND** the evidence records the non-adoption result without claiming controlled edit support

#### Scenario: Provider path discovers MCP but does not surface callable tool
- **WHEN** a Codex app-server provider path initializes the `locus_edit` MCP server and requests `tools/list`
- **BUT** the model does not receive `locus_edit.propose_file_edit` as a callable function
- **THEN** that provider path remains degraded for MCP-backed controlled edits
- **AND** another auth/provider path SHALL NOT inherit support from it or lend support to it

#### Scenario: Provider gateway path proves namespace tool adoption
- **WHEN** a Codex app-server provider-profile gateway path receives a Responses `type:"namespace"` tool for `locus_edit`
- **AND** the gateway forwards that nested tool as a callable upstream function without logging prompts or secrets
- **AND** a live guarded adoption probe records a `locus_edit.propose_file_edit` call under zero-prompt or light-hint conditions
- **THEN** that provider path may proceed to productive controlled-edit smoke

### Requirement: Locus-Controlled Edit Execution
The system SHALL keep productive Codex app-server guarded file edits under Locus main-process control.

#### Scenario: Proposed edit is approved
- **WHEN** Codex app-server calls the Locus-controlled edit dynamic tool with an in-scope path and valid edit payload
- **AND** Locus validates the path against the approved guarded scope contract
- **AND** Locus renders a bounded diff
- **AND** the user explicitly approves the edit
- **THEN** Locus applies the edit from the main process
- **AND** persists normalized runtime events and audit data
- **AND** no shell write is required for the edit

#### Scenario: Provider gateway path is enabled only after productive proof
- **WHEN** Codex app-server uses a provider-profile gateway binding
- **AND** gateway evidence proves non-shell tool definitions are surfaced as callable model tools
- **AND** productive controlled-edit smoke proves the dynamic tool returns to Locus, renders a diff, obtains approval, and writes the canary file
- **THEN** Locus MAY expose the productive controlled edit dynamic tool on that path behind the explicit executor gate
- **AND** unknown or unproven auth/provider paths remain degraded

#### Scenario: Proposed edit is not safe to apply
- **WHEN** the proposed edit is out of scope, malformed, stale, too large, missing approval UI, rejected, or times out
- **THEN** Locus fails closed before filesystem writes
- **AND** records a guarded denial or controlled-edit failure event
- **AND** does not ask app-server to retry the edit through a shell write fallback

#### Scenario: Dynamic tool is gated
- **WHEN** the explicit controlled edit executor gate is disabled
- **THEN** Locus SHALL NOT advertise the controlled edit dynamic tool to Codex app-server
- **AND** any unexpected `item/tool/call` request for the tool SHALL fail closed without filesystem writes

