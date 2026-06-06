## ADDED Requirements
### Requirement: Claude Dynamic Workflow Capability Gate
The system SHALL gate Claude Code dynamic workflows through a Claude-specific support detector and user setting before starting Claude runtime work.

#### Scenario: Workflow runtime is supported
- **WHEN** the bundled Claude Code runtime supports dynamic workflows
- **AND** the user setting is `ask` or `allow`
- **THEN** Locus allows Claude runtime requests to expose dynamic workflow capability
- **AND** the renderer can show the detected support status without receiving provider secrets

#### Scenario: Workflows are disabled
- **WHEN** the user setting is `off`
- **THEN** Locus starts Claude runtime requests with workflows disabled
- **AND** injects the runtime-supported disable mechanism
- **AND** denies any observed workflow launch with a clear local message

#### Scenario: Workflow runtime is unsupported
- **WHEN** the bundled Claude Code runtime does not support dynamic workflows
- **THEN** Locus reports dynamic workflows as unavailable
- **AND** does not present workflow launch controls as active
- **AND** prevents workflow launch attempts from starting runtime work

### Requirement: Runtime-Owned Workflow Commands
The system SHALL preserve Claude-owned workflow commands and triggers as Claude runtime input rather than expanding them as Locus slash-command templates.

#### Scenario: User enters a Claude workflow command
- **WHEN** the user sends `/deep-research`, `/workflows`, `/effort ultracode`, or a saved Claude workflow command in a Claude Code chat
- **THEN** Locus passes the command to the Claude runtime unchanged
- **AND** does not replace it with a Locus built-in prompt expansion

#### Scenario: Command guide lists workflow commands
- **WHEN** the command guide shows Claude Code runtime commands
- **THEN** dynamic workflow commands are labeled as Claude Code runtime-owned commands
- **AND** research-preview or availability status is shown when known
- **AND** the UI does not imply that those commands are available for Codex or custom providers

### Requirement: Workflow Launch Approval
The system SHALL require explicit Locus approval before a Claude dynamic workflow starts when dynamic workflows are set to `ask`.

#### Scenario: Workflow launch needs approval
- **WHEN** Claude requests the `Workflow` tool while the setting is `ask`
- **THEN** Locus shows an approval request with workflow name, summary or phase information when available, usage warning, and write-risk warning
- **AND** the workflow does not start until the user chooses `Once` or an allowed remembered decision applies

#### Scenario: User denies workflow launch
- **WHEN** the user denies the workflow approval request
- **THEN** Locus denies the `Workflow` tool call
- **AND** the chat stream receives a visible denied state
- **AND** no workflow progress card is shown as running

#### Scenario: Workflow launch approval times out
- **WHEN** the approval request is not answered within the configured timeout
- **THEN** Locus denies the workflow launch
- **AND** shows a retryable timeout message

#### Scenario: Workflow setting allows launch
- **WHEN** the user setting is `allow`
- **THEN** Locus does not require per-run launch approval
- **AND** still emits a visible workflow-started state when a workflow begins

### Requirement: Workflow Permission Boundary
The system SHALL preserve Locus permission, mode, local-only, and guarded-run boundaries when Claude dynamic workflows are active.

#### Scenario: Mode constraints cannot be enforced
- **WHEN** a Claude workflow would run in a mode where Locus cannot enforce the advertised tool restrictions for workflow-spawned work
- **THEN** Locus disables or denies the workflow launch for that mode
- **AND** reports the reason before starting workflow work

#### Scenario: Guarded run is active
- **WHEN** an agent scope contract or guarded-run policy is active
- **AND** a workflow-spawned tool call requests an operation outside the allowed scope
- **THEN** Locus applies the same guard decision as a non-workflow Claude tool call
- **AND** records the guard event normally

#### Scenario: Local-only guard blocks a hosted path
- **WHEN** workflow-related code attempts an official hosted upstream path that local-only mode blocks
- **THEN** Locus blocks the request through the existing local-only guard
- **AND** does not bypass the guard because the request came from a workflow

### Requirement: Workflow Progress Visibility
The system SHALL render Claude dynamic workflow progress as first-class but lightweight status inside the existing chat experience.

#### Scenario: Workflow starts
- **WHEN** Claude emits a workflow or workflow task start event
- **THEN** Locus shows a workflow progress card in the relevant assistant message
- **AND** the card includes workflow name or fallback label, status, and available phase or agent metadata

#### Scenario: Workflow updates
- **WHEN** Claude emits workflow progress updates
- **THEN** Locus updates the workflow card without creating a separate Locus job record
- **AND** unknown workflow event fields are ignored or shown as generic status without breaking the stream

#### Scenario: Workflow reaches final state
- **WHEN** a workflow succeeds, fails, is canceled, or is denied
- **THEN** Locus updates the workflow card to a terminal state
- **AND** preserves the final assistant output in the same chat flow when Claude provides it

### Requirement: Workflow Stop and MVP Boundary
The system SHALL support stopping active Claude workflows through the existing Claude cancellation path while deferring richer workflow management to later work.

#### Scenario: User stops active workflow
- **WHEN** a workflow is running in a Claude chat
- **AND** the user chooses Stop
- **THEN** Locus triggers the existing Claude abort/cancel path
- **AND** updates the workflow card to canceled or interrupted when the runtime reports termination

#### Scenario: User expects pause or resume
- **WHEN** the user looks for workflow pause, resume, save, or detailed `/workflows` management in the first slice
- **THEN** Locus does not present those controls as implemented
- **AND** the UI may direct users to Claude Code native surfaces for full workflow management

#### Scenario: Locus headless jobs are present
- **WHEN** the app also contains Locus headless job proposals or implementation
- **THEN** Claude workflow runs remain Claude runtime events in this change
- **AND** they are not persisted as Locus `agent_jobs` unless a later approved proposal adds that mapping
