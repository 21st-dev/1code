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
The Agent Workbench SHALL display desktop runtime traces from sanitized semantic events when they are available.

#### Scenario: User opens desktop job trace
- **WHEN** the user opens a desktop Claude or Codex job with persisted semantic events
- **THEN** the Workbench shows ordered timeline entries for assistant output, tools, guard decisions, permission requests, user questions, MCP readiness or elicitation, usage, status, errors, cancellation, and completion
- **AND** the timeline can filter or group entries by semantic event category

#### Scenario: Raw payload view is available
- **WHEN** the Workbench exposes raw job-event payloads for debugging
- **THEN** raw payloads remain secondary to semantic timeline status
- **AND** the payloads are already redacted before they reach the renderer

### Requirement: Workbench Runtime Diagnostics
The Agent Workbench SHALL distinguish runtime control-layer blockers from provider endpoint or authentication failures.

#### Scenario: Runtime preflight blocks a run
- **WHEN** desktop runtime preflight blocks a run before provider work starts
- **THEN** the Workbench shows the blocker as preflight, policy, MCP readiness, attachment readiness, local-only, or unsupported-capability state
- **AND** it does not present the failure as a provider model response failure

