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
