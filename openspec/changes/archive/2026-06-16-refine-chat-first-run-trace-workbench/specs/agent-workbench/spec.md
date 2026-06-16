## MODIFIED Requirements
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

## ADDED Requirements
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
