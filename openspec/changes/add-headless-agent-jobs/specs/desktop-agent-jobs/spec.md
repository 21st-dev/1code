## ADDED Requirements

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
- **AND** the UI reflects cancellation progress and final status

#### Scenario: User retries failed job
- **WHEN** the user retries a failed, canceled, or interrupted job from the desktop app
- **THEN** the app creates a new linked job using the same retry path used by the CLI
- **AND** the original job remains inspectable

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
