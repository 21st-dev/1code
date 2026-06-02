## ADDED Requirements

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
