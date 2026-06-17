# agent-workbench Specification

## Purpose
TBD - created by archiving change add-agent-workbench. Update Purpose after archive.
## Requirements
### Requirement: Local Agent Workbench Overview
The system SHALL provide a local Agent Workbench that summarizes coding-agent tasks from local projects, project-backed chats, worktrees, and sub-chats.

#### Scenario: User opens the workbench
- **WHEN** the user opens the Agent Workbench
- **THEN** the app lists local task cards derived from eligible non-archived project-backed chats and their latest sub-chat context
- **AND** folderless quick chats are excluded from the workbench because they have no project, worktree, diff, terminal, or PR context
- **AND** each card shows project, chat title, branch or local-directory mode, latest sub-chat, worktree path availability, status, and last updated time
- **AND** the app does not contact hosted upstream product services to populate the list

#### Scenario: No local tasks exist
- **WHEN** the user opens the Agent Workbench and no eligible project-backed chats exist
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
The unified Details sidebar SHALL be the canonical right-side inspector owner for current-chat details covered by the Details widget registry, including Plan, Diff, Terminal, and the Local Browser.

#### Scenario: Details sidebar renders inspector widgets
- **WHEN** the user opens the Details sidebar for a chat with a local workspace
- **THEN** the sidebar can render workspace, todo, plan, terminal, diff, MCP, trace, usage, and error widgets according to widget availability
- **AND** widgets use the existing widget registry and visibility/order mechanisms rather than ad hoc renderer-owned panels

#### Scenario: Plan, Diff, and Terminal expand through the Details owner
- **WHEN** a user expands Plan, Diff, or Terminal from the Details sidebar
- **THEN** the expanded content is rendered through the DetailsSidebar-owned expanded widget model with one expanded widget active at a time
- **AND** the expanded renderer preserves the behavior of the sidebar it replaces, including plan render/build actions, full diff review and PR actions, and interactive terminal session controls
- **AND** collapsing returns the user to the stacked Details widget view

#### Scenario: Legacy separate inspector sidebars are removed
- **WHEN** this phase ships
- **THEN** Plan, Diff, and Terminal do not have separate user-facing right-side sidebars competing with the Details sidebar
- **AND** the `unifiedSidebarEnabledAtom` rollback flag and the Plan/Diff/Terminal legacy sidebar code path it gated are removed
- **AND** `use-agent-panel-conflicts` coordination is removed rather than replaced by another Plan/Diff/Terminal right-region mutual-exclusion hook

#### Scenario: Local Browser is a Details-owned surface
- **WHEN** the user opens the Local Browser for a chat with a local workspace
- **THEN** it is presented as a Details widget that expands through the Details-owned expanded renderer, not as an independent competing right-side sidebar
- **AND** its independent per-chat open-state and standalone sidebar mount are removed
- **AND** the Local Browser preview boundary, diagnostics capture, and capture-to-chat handoff behavior are preserved

#### Scenario: Folderless quick chats do not expose the Local Browser
- **WHEN** a folderless quick chat (no project) is active
- **THEN** the Local Browser is not offered
- **AND** this matches the established quick-chat surface scope for repository-centric surfaces

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

### Requirement: File Viewer Details Ownership
The File Viewer SHALL be owned by the Details sidebar model: a Details-owned selected/open-file state drives a single Details file surface (the Files-tab navigator plus a Details expanded file preview), and there SHALL NOT be an independent competing File Viewer right-side sidebar.

#### Scenario: Opening a file uses the Details-owned surface
- **WHEN** the user opens a file from the Files tree, the diff "open file" action, a tool card, a file mention, or a git activity badge
- **THEN** the file opens in the single Details-owned file surface (a Details expanded file preview), not a separate File Viewer sidebar
- **AND** the open/selected file is tracked by a Details-owned selected-file state rather than the standalone `fileViewerOpenAtomFamily`
- **AND** the Files-tab tree highlight reflects the same selected-file state

#### Scenario: Indirect open entrypoints route through the choke point
- **WHEN** any `FileOpenProvider` consumer requests to open a file
- **THEN** the provider sets the Details-owned selected-file state
- **AND** no consumer opens an independent File Viewer sidebar

#### Scenario: File viewer display modes are normalized
- **WHEN** a returning user has a persisted file-viewer display mode of `side-peek` or `center-peek`
- **THEN** it is normalized to a valid post-change state (Details-expanded or full-page)
- **AND** `side-peek` and `center-peek` no longer open a separate competing right-side surface

#### Scenario: Performance behavior is preserved
- **WHEN** a large file is opened in the Details-owned file surface
- **THEN** existing file-viewer virtualization/large-file rendering behavior is preserved

#### Scenario: Folderless quick chats do not expose the File Viewer
- **WHEN** a folderless quick chat (no project) is active
- **THEN** the repository File Viewer is not offered
- **AND** this matches the established quick-chat surface scope for repository-centric surfaces

### Requirement: Details Default Layout
The Details sidebar SHALL apply an environment-first default widget order and default visibility, without overriding a user's persisted order or visibility.

#### Scenario: Default order on a workspace with no stored preference
- **WHEN** a project workspace has no persisted Details widget order
- **THEN** the default order is environment-first (workspace info, then changes/diff, then todo and plan, then mcp/trace/usage/error, with terminal and browser as lower launchers)

#### Scenario: User preference is respected
- **WHEN** the user has a persisted widget order or visibility for a workspace
- **THEN** the default is not applied over it

### Requirement: Details Auto-Open Policy
Opening of the Details sidebar SHALL distinguish an explicit user action from a context auto-open, and only the context auto-open path is policy-gated.

#### Scenario: Explicit user action still opens
- **WHEN** the user explicitly opens or expands a Details widget
- **THEN** the panel opens as before
- **AND** the policy gates only context auto-open, not user actions

#### Scenario: Allowed context auto-open events
- **WHEN** a plan is produced or a run error occurs
- **THEN** the context auto-open path may open the panel and expand the relevant widget

#### Scenario: Context auto-open respects a user-collapsed panel and quick chat
- **WHEN** the user has collapsed the Details panel, or the chat is a folderless quick chat
- **THEN** context events do not force the panel open

### Requirement: Terminal Default Placement
The terminal SHALL default to the bottom panel as its primary surface, with the Details terminal widget acting as a compact launcher/status.

#### Scenario: Default terminal surface
- **WHEN** the user opens the terminal with no persisted preference
- **THEN** it opens in the bottom panel
- **AND** the Details terminal widget launches or focuses that bottom terminal rather than hosting a separate session

#### Scenario: Persisted terminal mode is normalized
- **WHEN** a returning user has a persisted terminal display mode
- **THEN** it is normalized to a valid surface without a hard reset

### Requirement: Quick-Chat Details Degradation
IF a Details inspector is shown for a folderless chat, it SHALL show only runtime-relevant widgets and no repository widgets. This requirement does not by itself mandate showing a Details panel for folderless chats.

#### Scenario: Details shown for a folderless chat is restricted
- **WHEN** a Details inspector is shown for a folderless chat
- **THEN** it shows only usage, trace, and error widgets
- **AND** it does not show info, diff, terminal, mcp, plan, browser, or the file surface
- **AND** this matches the formal quick-chat surface scope

#### Scenario: Folderless gating uses workspace-kind semantics
- **WHEN** the implementation decides Details content for a folderless chat
- **THEN** it uses the existing folderless / missing-worktree semantics rather than a hard `projectId === null` check

#### Scenario: No forced panel
- **WHEN** a folderless quick chat does not otherwise show a Details inspector
- **THEN** this requirement does not force one to open

### Requirement: Workspace Environment Provenance Split
Static workspace environment state SHALL be displayed primarily in the Details panel, while message-level git provenance remains in the chat stream.

#### Scenario: Static environment state
- **WHEN** the user views current workspace environment state (project, branch, diff summary, terminal, file, browser)
- **THEN** the Details panel is the primary display and the chat stream does not duplicate that static readout

#### Scenario: Message-level provenance is preserved
- **WHEN** a turn produces git activity such as a commit, a PR, or a file change
- **THEN** the in-chat git-activity badge for that message is preserved as provenance and a jump entry
- **AND** it is not removed by the environment de-duplication

