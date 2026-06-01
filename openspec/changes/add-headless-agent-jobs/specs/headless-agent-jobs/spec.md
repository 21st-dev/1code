## ADDED Requirements

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

### Requirement: Future Local Daemon Queue Boundary
The system SHALL support a later local daemon queue that reuses durable jobs and the shared runtime core.

#### Scenario: Daemon enqueues job
- **WHEN** daemon mode is enabled and a caller enqueues a job
- **THEN** the daemon stores the job in SQLite
- **AND** starts it according to local concurrency limits
- **AND** does not require a renderer window to remain open

#### Scenario: Daemon restarts after crash
- **WHEN** the daemon starts and finds jobs marked running without an active worker
- **THEN** it marks those jobs as interrupted
- **AND** exposes retry or resume only when the runtime adapter supports it

### Requirement: Future Local Job Scheduling Boundary
The system SHALL support opt-in local schedules only after durable jobs and daemon recovery are implemented.

#### Scenario: User creates schedule
- **WHEN** the user creates a local schedule
- **THEN** the system stores schedule metadata locally
- **AND** shows the schedule as enabled, paused, or disabled
- **AND** creates visible jobs when schedule triggers fire

#### Scenario: User pauses schedule
- **WHEN** the user pauses a schedule
- **THEN** no new jobs are created by that schedule until it is resumed
- **AND** existing jobs keep their current status
