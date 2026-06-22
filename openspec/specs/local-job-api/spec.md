# local-job-api Specification

## Purpose
Defines the stable local-first contract for downstream applications to create,
observe, control, and read results from Locus-managed local agent jobs without
importing Locus source, reading SQLite directly, or passing provider secrets.
## Requirements
### Requirement: Machine-Readable Local Job API
The system SHALL provide a versioned Local Job API v1 for downstream local
consumers to create, inspect, cancel, retry, and read results for Locus jobs
without importing Locus source or reading Locus SQLite directly.

#### Scenario: Consumer creates API job
- **WHEN** a downstream consumer submits a valid `locus.local-job.v1` create
  request through `locus api runs create`
- **THEN** Locus creates a durable `source=api` local job
- **AND** persists sanitized consumer metadata, cwd, runtime, mode, prompt
  preview, artifact base, and timestamps
- **AND** returns a v1 JSON response containing the created job ID and status
- **AND** starts runtime work only after request validation and capability
  checks pass

#### Scenario: Consumer avoids internal database access
- **WHEN** a downstream consumer needs job status, events, result, cancellation,
  or retry
- **THEN** the consumer can use `locus api` commands for those operations
- **AND** the consumer does not need to read `agents.db` directly
- **AND** the response shape remains versioned with
  `apiVersion: locus.local-job.v1`

### Requirement: Runtime Capability Gate
The Local Job API SHALL validate requested runtime capabilities before provider
work starts.

#### Scenario: Runtime capabilities are listed
- **WHEN** a consumer runs `locus api runtimes list --json`
- **THEN** Locus returns registered runtime manifests with capability IDs,
  states, scopes, reasons, and remediation hints
- **AND** no provider secrets, OAuth tokens, raw headers, or plaintext
  credential values are included

#### Scenario: Required capability is unavailable
- **WHEN** a create request declares a required capability that the selected
  runtime reports as `degraded` or `unsupported`
- **THEN** Locus rejects the request or creates a failed job before provider
  work starts according to the documented API policy
- **AND** returns a normalized unsupported-capability diagnostic
- **AND** does not silently switch runtimes

### Requirement: Stable API Event Stream
The Local Job API SHALL expose stable v1 job events that are safe for downstream
consumers to parse.

#### Scenario: Consumer reads events
- **WHEN** a consumer runs `locus api runs events <job-id> --after <sequence>`
- **THEN** Locus returns events in increasing sequence order
- **AND** each event has `apiVersion`, `jobId`, `sequence`, `type`,
  `createdAt`, and sanitized `payload`
- **AND** consumers can resume event reads by passing the last seen sequence

#### Scenario: Consumer follows events
- **WHEN** a consumer runs `locus api runs events <job-id> --follow --jsonl`
- **THEN** stdout contains one JSON event envelope per line
- **AND** diagnostics and non-event messages are written to stderr
- **AND** the command exits after a terminal job status unless interrupted

### Requirement: Run Result and Artifact Manifest
The Local Job API SHALL produce a stable result envelope and run-owned artifact
manifest for API-created jobs.

#### Scenario: API job completes
- **WHEN** an API-created job reaches succeeded, failed, canceled, or
  interrupted status
- **THEN** Locus can return a v1 result envelope with job status, runtime, mode,
  consumer metadata, diagnostics, artifact manifest location, and artifact
  entries
- **AND** the result envelope does not include provider secrets, OAuth tokens,
  raw headers, or plaintext credential material

#### Scenario: Run artifact directory is configured
- **WHEN** a create request includes an artifact base directory
- **THEN** Locus writes run-owned metadata under `<artifactBaseDir>/<jobId>/`
- **AND** writes sanitized `request.json`, `events.jsonl`, `result.json`, and
  `artifacts.json`
- **AND** records the artifact manifest path on the job
- **AND** does not write downstream `final/` materials as part of API execution

### Requirement: Consumer Metadata Visibility
The desktop Workbench SHALL display API-created jobs with renderer-safe
consumer and artifact metadata.

#### Scenario: User opens Workbench with API job
- **WHEN** a `source=api` job exists
- **THEN** the Workbench identifies the job as API-created
- **AND** shows consumer ID, optional external run ID, runtime, mode, status,
  cwd, and artifact path/manifest when present
- **AND** uses the existing job log/detail surfaces for event history
- **AND** does not show provider tokens, raw request payloads, or secret-like
  metadata

### Requirement: Local-First and Secret Boundaries
The Local Job API SHALL preserve Locus local-first credential and execution
boundaries.

#### Scenario: Request contains secret-like fields
- **WHEN** a create request contains provider tokens, OAuth tokens,
  authorization headers, raw env values, API keys, passwords, or secret-like
  field names/values
- **THEN** Locus rejects the request before creating runnable provider work
- **AND** reports a sanitized validation error

#### Scenario: Runtime credentials are needed
- **WHEN** a runtime needs provider credentials for an API-created run
- **THEN** Locus resolves credentials through existing main-process provider
  profile or runtime setup paths
- **AND** the downstream consumer does not pass plaintext credential material
  over the API

### Requirement: Local Job API Project Onboarding
The Local Job API SHALL let a headless consumer register, inspect, remove from the active list, and restore a local project workspace through versioned `locus api projects` commands backed by a single shared project lifecycle owner, without using the desktop Workbench.

#### Scenario: Consumer registers a workspace
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json`
- **THEN** Locus canonicalizes the path, verifies it exists and is a directory,
  and registers it as a Locus project through the shared lifecycle owner that
  the desktop `projects` router also uses
- **AND** returns a `locus.local-job.v1` JSON envelope with the project ID, name,
  canonical path, and active/removed lifecycle state
- **AND** registration does not require a git remote and does not accept provider
  tokens, OAuth tokens, headers, env values, or other secret-like fields

#### Scenario: Re-registering an active workspace is idempotent
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json` for a
  path that is already active
- **THEN** Locus returns the existing project envelope with a success status
- **AND** does not create a duplicate project

#### Scenario: Re-registering a removed workspace restores it
- **WHEN** a consumer runs `locus api projects register --cwd <path> --json` for a
  canonical path that belongs to a removed project
- **THEN** Locus restores the existing project through the shared lifecycle owner
- **AND** clears the removed state
- **AND** returns the original project ID with retained history still linked

#### Scenario: Consumer checks workspace registration
- **WHEN** a consumer runs `locus api projects status --cwd <path> --json`
- **THEN** Locus reports whether the cwd resolves to a project record and, when
  it does, the owning project ID, name, canonical path, and active/removed state
- **AND** the command does not mutate registration state

#### Scenario: Consumer removes a workspace from the active list
- **WHEN** a consumer runs `locus api projects unregister --cwd <path> --json`
- **THEN** Locus removes the project from the active project list through the
  shared lifecycle owner and returns a versioned JSON envelope describing the
  removed project
- **AND** chats, sub-chats, worktrees, job history, and repository files are not
  deleted by default
- **AND** Locus refuses to remove a project that has active queued or running
  jobs unless `--force` is provided, reporting what would be affected
- **AND** `--force` only affects active-list removal and does not perform
  destructive project-history deletion

#### Scenario: Destructive project history deletion is not a headless command
- **WHEN** a consumer inspects or invokes Local Job API project commands in this
  lifecycle change
- **THEN** Locus does not expose a `projects delete-history` command
- **AND** permanent project-history deletion remains a desktop UI action with
  count-based confirmation

#### Scenario: Registration owner is shared, not duplicated
- **WHEN** project lifecycle logic is changed
- **THEN** both the desktop `projects` router and the headless `api projects`
  commands use the same shared lifecycle owner
- **AND** the headless commands do not maintain a second registration, removal,
  restore, or history-deletion code path

### Requirement: Local Job API Structured Registration Errors
The Local Job API SHALL report an unregistered project workspace through a stable
structured error code instead of requiring consumers to match human-readable
error text.

#### Scenario: Create targets an unregistered cwd
- **WHEN** a consumer runs `locus api runs create` with a cwd that is not inside
  any registered project
- **THEN** Locus rejects the request before provider work starts with a stable
  error envelope whose code is `project_not_registered`
- **AND** the consumer can branch on that code without parsing English stderr
- **AND** the command exit code preserves the existing invalid-cwd value

#### Scenario: Status reports a missing registration
- **WHEN** a consumer runs `locus api projects status --cwd <path> --json` for a
  cwd that is not inside any registered project
- **THEN** Locus returns a success-shaped envelope indicating the cwd is not
  registered, or a stable `project_not_registered` error envelope, per the
  documented status contract
- **AND** the response does not depend on consumers matching error message text

#### Scenario: Error envelope preserves the secret boundary
- **WHEN** Locus returns a registration error or a project onboarding envelope
- **THEN** the payload includes only the canonical path and registration
  metadata
- **AND** does not include provider tokens, OAuth tokens, raw headers, env
  values, or other secret-like material

### Requirement: Local Job API Runtime Trace Compatibility
The Local Job API SHALL preserve its stable v1 event and result envelopes while
the internal runtime event vocabulary converges on canonical `RunEvent` records.

#### Scenario: V1 consumer reads converged events
- **WHEN** a `locus.local-job.v1` consumer reads events for a job produced
  through the converged runtime event bridge
- **THEN** Locus returns the documented v1 event envelope with `apiVersion`,
  `jobId`, `sequence`, `type`, `createdAt`, and sanitized `payload`
- **AND** the consumer is not required to parse raw `RunEvent` fields

#### Scenario: Rich runtime data is unavailable in v1
- **WHEN** a canonical runtime event contains details that v1 does not expose as
  stable contract fields
- **THEN** Locus either maps those details into an existing sanitized v1 payload
  or omits them from v1 output
- **AND** introducing new rich interaction callbacks requires a separate Local
  Job API v2 or internal contract proposal

### Requirement: Local Job API Execution Profile Gate
The Local Job API SHALL keep existing v1 jobs on the safe default execution
profile unless a request is explicitly allowed to use another adapter profile.

#### Scenario: V1 request omits execution profile
- **WHEN** a valid v1 create request does not declare an approved non-batch
  execution profile
- **THEN** Locus runs the job through the default batch-compatible selector path
  when runtime capabilities and permission policy allow it
- **AND** existing consumers do not silently move to desktop/app-server
  execution semantics

#### Scenario: Requested profile needs interaction
- **WHEN** a Local Job API request asks for an adapter profile that requires
  user approval, AskUserQuestion, MCP elicitation, or unknown side-effect
  approval
- **AND** the request lacks an approved policy grant or interactive channel
- **THEN** Locus rejects or fails the run before provider work starts
- **AND** reports a sanitized unsupported-profile or fail-closed diagnostic

#### Scenario: Policy grant scopes are admission and audit metadata
- **WHEN** a Local Job API v1 request explicitly asks for `policy-grant`
  execution and supplies `runtime.policyGrant.scopes`
- **THEN** Locus may select an app-server-capable adapter only after validating
  the grant before provider work starts
- **AND** the v1 scope strings are treated as admission and audit metadata
  unless a later approved scope-enforcement change binds those strings to
  adapter permission decisions
- **AND** existing v1 callers that omit `runtime.executionProfile` continue to
  use the default batch selector path

