# agent-workbench Specification

## Purpose
TBD - created by archiving change add-agent-workbench. Update Purpose after archive.
## Requirements
### Requirement: Local Agent Workbench Overview
The system SHALL provide a local Agent Workbench that summarizes coding-agent tasks from local projects, chats, worktrees, and sub-chats.

#### Scenario: User opens the workbench
- **WHEN** the user opens the Agent Workbench
- **THEN** the app lists local task cards derived from non-archived chats and their latest sub-chat context
- **AND** each card shows project, chat title, branch or local-directory mode, latest sub-chat, worktree path availability, status, and last updated time
- **AND** the app does not contact hosted upstream product services to populate the list

#### Scenario: No local tasks exist
- **WHEN** the user opens the Agent Workbench and no eligible chats exist
- **THEN** the app shows an empty state that points users to create or select a local project chat

### Requirement: Workbench Status Classification
The system SHALL classify each task into an actionable local status.

#### Scenario: Task is running
- **WHEN** a task has an active or resumable stream marker
- **THEN** the task status is `running`
- **AND** the card shows which sub-chat is active when known

#### Scenario: Task is blocked
- **WHEN** a task has a pending user question, pending plan approval, runtime/auth error marker, or missing worktree needed for actions
- **THEN** the task status is `blocked`
- **AND** the card shows a concise reason

#### Scenario: Task needs review
- **WHEN** a task has uncommitted local changes or derived diff files
- **THEN** the task status is `needs-review`
- **AND** the card shows file and line-change counts when available

#### Scenario: Task has pull request
- **WHEN** a task has a tracked pull request URL or number
- **THEN** the task status is `has-pr`
- **AND** the card exposes pull request state when available

#### Scenario: Task is clean
- **WHEN** a task has no running marker, no blocking reason, no reviewable diff, and no tracked pull request
- **THEN** the task status is `clean`

### Requirement: Workbench Filters
The system SHALL provide filters for task review and continuation.

#### Scenario: User filters tasks
- **WHEN** the user selects All, Running, Needs Review, PRs, Blocked, or Clean
- **THEN** the workbench list updates to show only matching tasks
- **AND** filter counts reflect the currently loaded task set

### Requirement: Workbench Task Actions
The system SHALL expose safe actions that reuse existing local chat, diff, and GitHub workflow behavior.

#### Scenario: User opens a task
- **WHEN** the user chooses Open or Continue on a workbench task
- **THEN** the app navigates to the matching chat
- **AND** selects the latest or requested sub-chat when available

#### Scenario: User reviews a task
- **WHEN** the user chooses Review Diff on a task with reviewable changes
- **THEN** the app opens the existing diff/review surface for that task
- **AND** the action is disabled with a reason when no worktree or diff is available

#### Scenario: User opens or creates a pull request
- **WHEN** the user chooses Open PR on a task with a pull request URL
- **THEN** the app opens that pull request externally
- **WHEN** the user chooses Create PR on a task without a pull request
- **THEN** the app uses the existing GitHub workflow preparation and confirmation flow
- **AND** no public GitHub write occurs without explicit confirmation

### Requirement: Local-Only Boundary
The Agent Workbench SHALL preserve Locus local-first boundaries.

#### Scenario: Local-only mode is enabled
- **WHEN** local-only mode is enabled
- **THEN** the workbench may read local SQLite state, local git state, and user-initiated GitHub CLI context
- **AND** it does not initialize hosted upstream auth, remote sandbox, inbox, automation, telemetry, or hosted update services

### Requirement: Observed Run Visibility
The Agent Workbench SHALL make default observed Agent-mode activity visible without presenting it as hard enforcement.

#### Scenario: User views an active observed run
- **WHEN** an observed Agent-mode run is active
- **THEN** the Workbench or linked chat surface shows the run control level, runtime, current status, and available stop/cancel action
- **AND** observed tool/action events appear in chronological order when available

#### Scenario: User views a risky observed action
- **WHEN** an observed run emits a high-risk action event
- **THEN** the Workbench or linked chat surface highlights the event as risky
- **AND** the UI does not claim the action was blocked unless the event records a deny decision

#### Scenario: User views an observed safety denial
- **WHEN** an observed run denies a catastrophic action before execution
- **THEN** the Workbench or linked chat surface shows the denied action, risk category, and renderer-safe explanation
- **AND** the UI labels the event as observed safety rather than guarded scope-contract enforcement

#### Scenario: User views a completed observed run
- **WHEN** an observed Agent-mode run completes, fails, or is canceled
- **THEN** the Workbench can show a compact observed-run summary with action counts, high-risk action counts, final status, and links to existing diff or review surfaces when local changes are present
- **AND** the summary remains local-first and does not initialize hosted upstream services

### Requirement: Workbench Semantic Runtime Timeline
The Agent Workbench SHALL display runtime traces as semantic product rows from a shared `WorkbenchTraceRow` presenter when sanitized job events are available.

#### Scenario: User inspects current desktop chat trace
- **WHEN** the user is working in an interactive desktop chat with linked persisted job events
- **THEN** the unified Details sidebar can show a compact trace widget for the current chat, sub-chat, or run
- **AND** the widget summarizes runtime, provider, MCP, tool, file-change, approval, usage, error, and final-state rows when those rows can be derived from existing sanitized events
- **AND** the widget acts as a compact summary and jump index rather than duplicating the full conversation or raw job log beside chat

#### Scenario: User opens job history trace
- **WHEN** the user opens a headless, API, daemon, schedule, protocol, or historical desktop job
- **THEN** the Runs/History job trace surface shows ordered semantic timeline entries for assistant output, tools, guard decisions, permission requests, user questions, MCP readiness or elicitation, usage, status, errors, cancellation, and completion
- **AND** the timeline can filter or group entries by semantic event category
- **AND** jobs without linked chat transcripts remain inspectable through persisted job events

#### Scenario: Job trace shows the selected job record
- **WHEN** the user opens a job in the Runs/History job trace surface
- **THEN** the surface shows the selected job's record header derived from the existing `agentJobs.show` procedure, including runtime, provider profile or binding when present, status, created/started/finished timing, and final error summary
- **AND** the record header appears above the semantic timeline so the job's identity and outcome are legible without scrolling the event rows
- **AND** the header reuses already-redacted job data and does not display provider secrets, tokens, or raw stack traces

#### Scenario: Trace rows share a presenter
- **WHEN** the Details sidebar trace widget and Runs/History job trace surface render the same persisted event
- **THEN** both surfaces use the same `WorkbenchTraceRow` presenter to derive event kind, title, status, next action, severity, and raw-payload affordance
- **AND** runtime-specific chunks are normalized at the event or presenter boundary rather than through duplicate timeline components

#### Scenario: Raw payload view is available
- **WHEN** a trace surface exposes raw job-event payloads for debugging
- **THEN** raw payloads remain secondary to semantic timeline status
- **AND** the payloads are already redacted before they reach the renderer

### Requirement: Workbench Runtime Diagnostics
The Agent Workbench SHALL distinguish runtime control-layer blockers from provider endpoint or authentication failures.

#### Scenario: Runtime preflight blocks a run
- **WHEN** desktop runtime preflight blocks a run before provider work starts
- **THEN** the Workbench shows the blocker as preflight, policy, MCP readiness, attachment readiness, local-only, or unsupported-capability state
- **AND** it does not present the failure as a provider model response failure

### Requirement: Chat-First Workbench Surface
Locus SHALL treat Chat as the default operating surface for interactive desktop agent work and treat trace/history views as inspectors or audit surfaces.

#### Scenario: User opens an interactive desktop chat
- **WHEN** the user opens a normal interactive Claude Code or Codex desktop chat
- **THEN** the app keeps the conversation, tool cards, approvals, and input box in the primary Chat surface
- **AND** the app does not require the user to switch to a separate Workbench page to continue the run

#### Scenario: User needs deeper inspection
- **WHEN** the user wants to inspect what the agent did during the current chat
- **THEN** the app exposes details through the unified Details sidebar for the current chat or run
- **AND** the app does not introduce a new default top-level Chat/Trace toggle for normal interactive chat in this slice

#### Scenario: User reviews a job without a chat transcript
- **WHEN** a job was created by a headless, API, daemon, schedule, or protocol entrypoint without a useful chat transcript
- **THEN** the Runs/History job trace surface is the primary inspection surface for that job
- **AND** the job trace is bound to the selected job rather than presented as a competing default workspace beside Chat

### Requirement: Unified Details Inspector Ownership
The unified Details sidebar SHALL be the canonical right-side inspector owner for current-chat details.

#### Scenario: Details sidebar renders inspector widgets
- **WHEN** the user opens the Details sidebar for a chat with a local workspace
- **THEN** the sidebar can render workspace, todo, plan, terminal, diff, MCP, trace, usage, and error widgets according to widget availability
- **AND** widgets use the existing widget registry and visibility/order mechanisms rather than ad hoc renderer-owned panels

#### Scenario: Expanded renderer is needed
- **WHEN** a user expands Plan, Diff, or Terminal from the Details sidebar
- **THEN** the app may open the existing larger renderer for that content
- **AND** the Details sidebar remains the product entry point and state owner for that inspector category

#### Scenario: Legacy separate sidebar path remains during migration
- **WHEN** a temporary separate-sidebar fallback remains available during this change
- **THEN** it is either not a user-facing product mode or is guarded by an explicit migration flag
- **AND** the change records a deletion follow-up before implementation is considered complete

### Requirement: Actionable Error Trace Rows
The workbench trace surfaces SHALL render runtime, provider, MCP, guard, worktree, and job failures with product error semantics.

#### Scenario: Error row is derived
- **WHEN** a sanitized job event, message part, or runtime diagnostic can be mapped to a documented product error code
- **THEN** the trace or error widget shows the stable code, short title, concise body, next action, and optional redacted details
- **AND** raw stack traces, provider secrets, Authorization headers, cookies, OAuth codes, raw environment values, and unredacted MCP payloads are not shown as primary error content

#### Scenario: Error is not yet classified
- **WHEN** a failure cannot be mapped to a documented product error code
- **THEN** the UI shows a bounded unknown or internal error state with redacted details
- **AND** the row remains actionable by pointing the user to retry, open settings, inspect logs, or copy redacted details when appropriate

