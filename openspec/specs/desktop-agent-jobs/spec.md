# desktop-agent-jobs Specification

## Purpose
TBD - created by archiving change add-headless-agent-jobs. Update Purpose after archive.
## Requirements
### Requirement: Desktop Job Overview
The desktop app SHALL show active and recent local agent jobs in the agents/workbench experience.

#### Scenario: User opens job overview
- **WHEN** the user opens the job overview
- **THEN** the app lists active and recent jobs from local SQLite state
- **AND** each row or card shows job id, status, runtime, source, cwd or project, linked chat when available, and last update time
- **AND** the overview does not contact hosted upstream product services to populate local jobs

#### Scenario: CLI-created job exists
- **WHEN** a job was created by the CLI
- **THEN** the desktop job overview includes that job after refresh or subscription reconnect
- **AND** the user can inspect its event history from the desktop app

#### Scenario: Desktop chat run is persisted as a desktop job
- **WHEN** a user sends an ordinary desktop chat message through Claude Code or Codex
- **THEN** the system creates a linked `agent_jobs` record with `source=desktop`
- **AND** the job links to the same project, chat, sub-chat, cwd, runtime, mode, and prompt preview
- **AND** the existing chat/sub-chat message, session, and stream persistence remains the transcript source of truth
- **AND** provider credentials, raw auth headers, and plaintext provider secrets are not stored in the job row or job events

#### Scenario: Desktop chat job preserves current chat behavior
- **WHEN** a desktop chat job is created around an existing Claude Code or Codex stream
- **THEN** the current desktop chat UI continues to receive stream chunks through the existing transport
- **AND** the current `sub_chats.messages`, `session_id`, and `stream_id` behavior is preserved
- **AND** runtime-specific tool approval, guarded-run, rollback, attachment, and auth handling are not replaced by the job wrapper

### Requirement: Desktop Job Detail and Logs
The desktop app SHALL provide a job detail view that replays persisted job events and follows live updates when available.

#### Scenario: User opens running job detail
- **WHEN** the user opens detail for a running job
- **THEN** the app displays persisted events in order
- **AND** subscribes or polls for later events from the last seen sequence number

#### Scenario: User opens completed job detail
- **WHEN** the user opens detail for a completed, failed, canceled, or interrupted job
- **THEN** the app displays the final status, timing, result or error metadata, and event history
- **AND** no live runtime subscription is required to inspect the transcript

### Requirement: Desktop Job Actions
The desktop app SHALL expose safe local actions for jobs while reusing existing chat, review, and GitHub confirmation surfaces.

#### Scenario: User opens linked chat
- **WHEN** a job has a linked chat or sub-chat
- **THEN** the app provides an action to open that chat or sub-chat
- **AND** the action is disabled with a reason when the linked record is missing

#### Scenario: User cancels running job
- **WHEN** the user cancels a running job from the desktop app
- **THEN** the app calls the same job cancellation path used by the CLI
- **AND** the UI reflects cancellation as requested until the worker confirms `canceled` or recovery marks `interrupted`

#### Scenario: User cancels a desktop chat job from Workbench
- **WHEN** the user cancels a running `source=desktop` job from the Workbench
- **THEN** the app records a persisted cancel request for that job
- **AND** routes cancellation to the exact active desktop stream that owns that job
- **AND** does not cancel a newer stream in the same sub-chat when the selected job is no longer active

#### Scenario: User retries failed CLI job
- **WHEN** the user retries a failed, canceled, or interrupted non-desktop job from the desktop app
- **THEN** the app creates a new linked job using the same retry path used by the CLI
- **AND** the original job remains inspectable

#### Scenario: Desktop chat retry is not generic
- **WHEN** a `source=desktop` job is failed, canceled, or interrupted
- **THEN** the app keeps the job inspectable
- **AND** generic job retry is disabled or redirected to the linked chat
- **AND** the system does not append a duplicate chat message or create an orphan desktop job from the generic retry action

### Requirement: Desktop Reconnect Behavior
The desktop app SHALL recover job visibility after renderer reloads, app restarts, or CLI/daemon-created work.

#### Scenario: Renderer reloads while job runs
- **WHEN** the renderer reloads while a job is running
- **THEN** the app reloads job metadata from SQLite
- **AND** resumes event display from persisted event sequence numbers

#### Scenario: App starts after interrupted job
- **WHEN** the app starts and finds interrupted jobs
- **THEN** the overview shows them as interrupted
- **AND** exposes retry or resume only when supported

### Requirement: Desktop Jobs Use Verified Runtime Context
Desktop chat jobs SHALL be created from verified desktop runtime preflight context.

#### Scenario: Desktop chat job starts
- **WHEN** a Claude or Codex desktop chat run creates a `source=desktop` job
- **THEN** the job uses the same verified project, chat, sub-chat, cwd, runtime, mode, and prompt preview that will be passed to runtime setup
- **AND** job creation does not allow runtime startup to continue with a different raw renderer-supplied cwd or sub-chat

#### Scenario: Preflight fails before job is running
- **WHEN** desktop runtime preflight rejects the project, chat, sub-chat, cwd, provider, MCP, attachment, or local-only state
- **THEN** no provider work starts
- **AND** the job is either not created or is persisted as failed with a renderer-safe preflight diagnostic

### Requirement: Desktop Jobs Persist Semantic Runtime Events
Desktop chat jobs SHALL persist sanitized semantic runtime events for later Workbench replay.

#### Scenario: Desktop stream emits semantic events
- **WHEN** a desktop Claude or Codex run emits assistant, tool, guard, question, MCP, usage, status, error, cancellation, or completion events
- **THEN** the system persists ordered job events with stable sequence numbers and sanitized payloads
- **AND** raw provider chunks are not required to reconstruct the Workbench timeline

#### Scenario: Secret-like payload is observed
- **WHEN** runtime events, diagnostics, MCP payloads, provider metadata, or error messages include secret-like values
- **THEN** the values are redacted before the event is persisted or emitted to the renderer

