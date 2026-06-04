## Context
Locus already persists local agent work as jobs and events, and it exposes human
CLI commands (`locus run`, `locus jobs`), daemon queueing, schedules, desktop
job visibility, and a minimal stdio protocol. That gives Locus the internal job
platform, but not a stable contract for downstream applications.

Downstream local tools should own their own domain packages, drafts, final
promoted artifacts, and tracking state. Locus should own local runtime
execution, job state, sanitized event logs, cancellation, retry, runtime
capability checks, and local audit trails.

## Goals / Non-Goals
- Goals:
  - Provide a stable machine-readable CLI surface for downstream projects.
  - Keep the API local-first and main-process-owned.
  - Keep stdout parseable for JSON/JSONL commands.
  - Let consumers create jobs with consumer metadata and artifact policy.
  - Let consumers incrementally read normalized v1 events.
  - Let consumers read final result and artifact manifests without reading
    SQLite directly.
  - Make runtime capability checks part of the API contract.
  - Show API-created jobs in Workbench without building downstream
    domain-specific UI.
- Non-goals:
  - Hosted agents, cloud queues, or remote sync.
  - HTTP/WebSocket server in v1.
  - Full ACP parity.
  - Generic workflow engine.
  - Direct mutation of downstream final artifacts.

## Proposed Surface
Use a new `locus api` command group:

```text
locus api runtimes list --json
locus api runs create --request <path|-> --json
locus api runs status <job-id> --json
locus api runs events <job-id> --after <sequence> [--follow] --jsonl
locus api runs result <job-id> --json
locus api runs cancel <job-id> --json
locus api runs retry <job-id> --json
```

`locus run` and `locus jobs` remain human-oriented compatibility commands.
Downstream consumers SHOULD use `locus api` so API output can remain stable even
if human CLI formatting changes.

The `locus api` surface still uses the packaged Electron main process in
headless mode. It must not be implemented as a standalone Node script because
that would split userData, migrations, safeStorage, bundled runtime binaries,
and provider-profile resolution.

## Request Shape
The create request is JSON:

```json
{
  "apiVersion": "locus.local-job.v1",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "package-review-001"
  },
  "project": {
    "cwd": "/absolute/project/path",
    "projectId": null
  },
  "runtime": {
    "id": "codex",
    "requiredCapabilities": ["planMode"]
  },
  "mode": "plan",
  "prompt": {
    "text": "Review this local package."
  },
  "input": {
    "contract": "example.local-package.v1",
    "packageDir": "/absolute/local/package"
  },
  "artifacts": {
    "baseDir": "/absolute/local/package/.locus/runs",
    "writePolicy": "proposal-only"
  }
}
```

The API validates:
- supported `apiVersion`
- bounded consumer IDs and external IDs
- absolute `cwd`
- allowed runtime and mode
- requested capabilities against the selected runtime manifest before provider
  work starts
- artifact base directory is absolute and can be created if needed
- request payload does not include secret-like keys or values

## Job Source and Metadata
Add `api` as an agent job source. API jobs are durable jobs like CLI jobs, but
they carry additional renderer-safe metadata:

- `consumerId`
- `consumerRunId`
- `artifactBaseDir`
- `artifactManifestPath`

The prompt remains stored through the existing sanitized input path. Consumer
metadata must be bounded and redacted before persistence.

## Event and Result Shape
External consumers receive v1 envelopes:

```json
{
  "apiVersion": "locus.local-job.v1",
  "jobId": "job_...",
  "sequence": 4,
  "type": "assistant_delta",
  "createdAt": "2026-06-04T00:00:00.000Z",
  "payload": {
    "text": "..."
  }
}
```

The stable v1 event surface is a subset of internal event types:

- `job_created`
- `job_started`
- `assistant_delta`
- `reasoning_delta`
- `tool_started`
- `tool_delta`
- `tool_finished`
- `status`
- `error`
- `completed`
- `artifact_created`

Internal events may include more types. The API maps unknown internal events to
`status` or omits them only when documented and safe.

Final result output includes job status, runtime, mode, consumer metadata,
artifact manifest location, artifact entries, and diagnostics. It must not
include provider secrets or raw request headers.

## Artifact Contract
Locus owns per-run metadata under the configured artifact base:

```text
<artifactBaseDir>/<jobId>/
  request.json
  events.jsonl
  result.json
  artifacts.json
```

Downstream applications own business artifacts such as:

```text
local-package/
  source.md
  notes.md
  drafts/
  final/
```

In v1, Locus may write run metadata and proposed draft artifacts when explicitly
requested by artifact policy. Locus must not write downstream `final/` material
as part of API execution. Promotion remains a downstream/user action.

## Workbench UI
Workbench should show API-created jobs with source `api`, consumer ID, optional
external run ID, artifact base/manifest links, status, runtime, cwd, and log
history. The design should stay utilitarian: compact metadata rows and existing
job detail actions, not a downstream domain-specific page.

## Security
- Provider tokens, OAuth tokens, raw request headers, and raw environment values
  are rejected from request payloads and redacted from persisted events/results.
- Runtime credentials are resolved through existing Locus main-process paths.
- API stdout is machine-readable. Diagnostics go to stderr.
- No network listener is added.
- Renderer receives only sanitized job metadata.

## Compatibility
The v1 API is additive. It does not remove or change `locus run`, `locus jobs`,
minimal `locus acp`, desktop chat jobs, daemon jobs, or schedule jobs.

Version changes:
- `apiVersion: locus.local-job.v1` is required for requests and responses.
- Future incompatible payload changes require v2 or an explicit migration.

## Open Questions
- Whether v1 should allow consumer-provided artifact draft paths beyond the
  run-owned directory. First implementation should keep this disabled unless
  explicitly required by a downstream smoke test.
- Whether Windows real packaged smoke should be part of this change or remain
  under the existing headless Windows acceptance gate. The implementation should
  include source/unit coverage and document real Windows smoke as pending if it
  cannot be run locally.
