# headless-agent-jobs Specification

## Purpose
TBD - created by archiving change add-headless-agent-jobs. Update Purpose after archive.
## Requirements
### Requirement: Durable Local Agent Jobs
The system SHALL persist agent work as local jobs with append-only event history in the existing app-managed SQLite database.

#### Scenario: Job is created
- **WHEN** a desktop, CLI, daemon, schedule, or protocol caller creates an agent job
- **THEN** the system stores a job record with source, runtime, mode, cwd, prompt preview, status, retry linkage, attempt number, and timestamps
- **AND** stores no provider secrets in the job record

#### Scenario: Job emits events
- **WHEN** a running job emits normalized runtime events
- **THEN** the system appends event records with monotonically increasing sequence numbers
- **AND** the event stream can be replayed after the original renderer or CLI process disconnects

#### Scenario: Job reaches terminal state
- **WHEN** a job succeeds, fails, is canceled, or is interrupted
- **THEN** the system records a terminal status, finish timestamp, and normalized exit/error metadata
- **AND** the job no longer accepts non-diagnostic runtime events

#### Scenario: Worker heartbeat is lost
- **WHEN** the app starts, the CLI starts, or recovery runs
- **AND** a job is marked `running` without a recent worker heartbeat
- **THEN** the system marks the job `interrupted`
- **AND** preserves the existing event history
- **AND** exposes retry only through the normal retry path

#### Scenario: User requests cancellation
- **WHEN** a desktop or CLI caller cancels a running job
- **THEN** the system records a persisted cancel request before changing terminal status
- **AND** the active worker observes the cancel request and stops the runtime when possible
- **AND** the job becomes `canceled` only after the worker confirms cancellation
- **AND** a worker that disappears before confirming cancellation leaves the job `interrupted`, not `canceled`

#### Scenario: Multiple local processes write job state
- **WHEN** the GUI process and one or more headless CLI processes access local job state
- **THEN** writes use the existing app SQLite database with WAL, a busy timeout, and short transactions
- **AND** event sequence numbers are monotonic per job
- **AND** duplicate sequence numbers for one job are rejected or retried safely

### Requirement: One-Shot Headless Run
The system SHALL provide a one-shot headless run command for local agent work without requiring a visible desktop window.

#### Scenario: User runs a prompt from CLI
- **WHEN** the user runs `locus run` with a cwd, runtime, mode, and prompt
- **THEN** the packaged CLI launches the Locus Electron main process in headless CLI mode
- **AND** the main process starts a local agent job through the shared runtime core without creating a BrowserWindow
- **AND** streams or prints output according to the selected output format
- **AND** exits with a process code that reflects success, failure, cancellation, or invalid input

#### Scenario: User pipes stdin
- **WHEN** the user pipes stdin into `locus run`
- **THEN** the system includes the stdin content as part of the run input
- **AND** enforces a documented maximum stdin size or returns a clear error before starting runtime work

#### Scenario: User requests structured output
- **WHEN** the user selects JSON or stream JSON output
- **THEN** the command writes machine-readable job, event, and result payloads to stdout
- **AND** diagnostics that are not part of the structured payload go to stderr

#### Scenario: CLI cannot start headless main process
- **WHEN** the packaged CLI cannot launch or connect to the Locus Electron main process in headless CLI mode
- **THEN** the command exits with a local process failure code
- **AND** prints a diagnostic to stderr without writing partial structured output to stdout

#### Scenario: macOS headless command starts
- **WHEN** the user runs `locus run` or `locus jobs` on macOS
- **THEN** the CLI shim synchronously executes the packaged Locus binary with a private headless marker
- **AND** preserves stdin, stdout, stderr, and the process exit code
- **AND** does not use `open -a` for the headless command

#### Scenario: Windows headless command starts
- **WHEN** the user runs `locus run` or `locus jobs` on Windows
- **THEN** the CLI shim synchronously executes the packaged Locus executable with a private headless marker
- **AND** preserves stdin, stdout, stderr, and the process exit code
- **AND** does not use a detached `start` invocation for the headless command

#### Scenario: Headless command runs while GUI is open
- **WHEN** the desktop app is already running
- **AND** the user starts a headless CLI command
- **THEN** the headless process handles the command without creating or focusing a BrowserWindow
- **AND** the command is not rejected merely because the GUI single-instance lock is held
- **AND** shared job visibility and cancellation are coordinated through the durable job store

#### Scenario: Structured output is requested
- **WHEN** the user selects `json` or `stream-json` output
- **THEN** stdout contains only documented JSON payloads
- **AND** diagnostics, migration messages, runtime setup logs, and warnings are written to stderr or suppressed

#### Scenario: CLI job has no chat link
- **WHEN** a CLI job is created for a cwd that does not map cleanly to an existing chat or sub-chat
- **THEN** the job is still created and runnable
- **AND** linked chat fields remain empty
- **AND** job history is read from `agent_jobs` and `agent_job_events`

#### Scenario: User enqueues a daemon job
- **WHEN** the user runs `locus run --daemon` with a cwd, runtime, mode, and prompt
- **THEN** the packaged CLI launches the Locus Electron main process in headless CLI mode
- **AND** creates a queued `source=daemon` job in the existing SQLite job store
- **AND** does not run the runtime in the submitter process
- **AND** prints the created job according to the selected output format

### Requirement: Job Management CLI
The system SHALL provide CLI commands for inspecting and managing local jobs.

#### Scenario: User lists jobs
- **WHEN** the user runs `locus jobs list`
- **THEN** the system prints recent local jobs with id, status, runtime, cwd, source, and timestamps
- **AND** supports a JSON output option for scripting

#### Scenario: User views job details
- **WHEN** the user runs `locus jobs show <job-id>`
- **THEN** the system prints job metadata and final result or current status
- **AND** returns a clear not-found error for an unknown job id

#### Scenario: User follows job logs
- **WHEN** the user runs `locus jobs logs <job-id> --follow`
- **THEN** the system streams existing and new job events in order
- **AND** exits after the job reaches a terminal status unless the user interrupts earlier

#### Scenario: User cancels a job
- **WHEN** the user runs `locus jobs cancel <job-id>` for a running job
- **THEN** the system requests cancellation through the job runner
- **AND** records a canceled terminal status when cancellation completes

#### Scenario: User retries a job
- **WHEN** the user retries a failed, canceled, or interrupted job
- **THEN** the system creates a new job linked to the original job
- **AND** increments the attempt number for the retry chain
- **AND** preserves the original job history unchanged

### Requirement: Local Daemon Queue
The system SHALL provide an opt-in local daemon queue that reuses durable jobs and the shared runtime core.

#### Scenario: Daemon starts without a renderer window
- **WHEN** the user runs `locus daemon run`
- **THEN** the packaged CLI launches the Locus Electron main process in daemon mode
- **AND** the daemon starts before GUI single-instance handling, menu construction, BrowserWindow creation, updater startup, auth callback server startup, and GUI-only MCP warmup
- **AND** the daemon writes diagnostics to stderr without polluting structured stdout

#### Scenario: Daemon claims queued daemon jobs
- **WHEN** the daemon is running
- **AND** queued `source=daemon` jobs exist
- **THEN** the daemon starts those jobs through the shared runtime core according to configured local concurrency limits
- **AND** writes heartbeat, cancel, runtime event, and completion state through `agent_jobs` and `agent_job_events`
- **AND** does not claim `source=desktop`, default one-shot `source=cli`, or `source=protocol` jobs
- **AND** claims `source=schedule` jobs only through the explicit local scheduling scenario

#### Scenario: Daemon follows cancellation requests
- **WHEN** `locus jobs cancel <job-id>` is used for a running daemon job
- **THEN** the system records a persisted cancel request
- **AND** the daemon worker observes the request through the job observer
- **AND** the daemon marks the job `canceled` only after the runtime stops or the worker confirms cancellation

#### Scenario: User follows daemon logs
- **WHEN** a user follows a daemon job with `locus run --daemon --follow` or `locus jobs logs <job-id> --follow`
- **THEN** the CLI streams persisted events in sequence
- **AND** exits after the daemon job reaches a terminal status

#### Scenario: Daemon restarts after crash
- **WHEN** the daemon starts and finds jobs marked running without an active worker
- **THEN** it marks those jobs as interrupted
- **AND** exposes retry or resume only when the runtime adapter supports it

#### Scenario: Daemon coordination stays local
- **WHEN** the local daemon is running
- **THEN** it uses only local per-user coordination primitives and the app SQLite database for queue state
- **AND** does not expose an unauthenticated TCP HTTP or WebSocket control surface by default
- **AND** does not accept provider tokens, API keys, or raw environment values from daemon clients

### Requirement: Local Job Scheduling
The system SHALL support opt-in local schedules that create visible local jobs through the durable job store.

#### Scenario: User creates schedule
- **WHEN** the user creates a local schedule
- **THEN** the system stores schedule metadata locally
- **AND** shows the schedule as enabled, paused, or disabled
- **AND** creates visible `source=schedule` jobs when schedule triggers fire

#### Scenario: User pauses schedule
- **WHEN** the user pauses a schedule
- **THEN** no new jobs are created by that schedule until it is resumed
- **AND** existing jobs keep their current status

#### Scenario: User runs schedule now
- **WHEN** the user manually runs an enabled or paused schedule
- **THEN** the system creates a queued `source=schedule` job immediately
- **AND** records schedule audit metadata that links the job back to the schedule

#### Scenario: Daemon evaluates due schedules
- **WHEN** the local daemon is running
- **AND** an enabled schedule is due
- **THEN** the daemon creates at most one queued `source=schedule` job for that schedule fire
- **AND** updates the next-run metadata before another daemon poll can create a duplicate
- **AND** may claim the queued schedule job through the same runner core

#### Scenario: User deletes schedule
- **WHEN** the user deletes a local schedule
- **THEN** the schedule no longer creates new jobs
- **AND** previously created jobs and events remain visible in job history

