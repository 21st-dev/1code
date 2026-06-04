# Local Job API v1 Consumer Guide

Languages: English | [Simplified Chinese](local-job-api-v1-consumer-guide.zh-CN.md)

This guide is for downstream local applications that want to use Locus as the
runtime layer without importing Locus source code or reading `agents.db`
directly. The contract is runtime- and domain-neutral.

The v1 entrypoint is the machine-readable CLI group:

```bash
locus api ...
```

Use `locus api` for integrations. Keep `locus run` and `locus jobs` for humans
and compatibility scripts.

## Documentation Model

This guide follows the structure of established official manuals:

- [GitHub CLI Manual](https://cli.github.com/manual/) separates installation,
  configuration, command reference, and examples for scriptable CLI use.
- [Stripe API Reference](https://docs.stripe.com/api?lang=curl) makes request
  and response envelopes explicit and treats errors as part of the integration
  contract.
- [Docker CLI Reference](https://docs.docker.com/reference/cli/docker/)
  documents environment/configuration rules, examples, subcommands, and
  sensitive configuration warnings.

The Locus guide applies those patterns to a local CLI + JSON contract rather
than an HTTP API.

## What v1 Provides

Local Job API v1 lets a consumer:

- list runtime capability manifests
- create an agent run
- read run status
- read normalized event envelopes
- read the final result envelope
- cancel a queued or running API job
- retry a failed, canceled, or interrupted API job
- collect run-owned metadata artifacts

It does not provide:

- an HTTP or WebSocket server
- hosted queues or cloud agents
- direct writes into downstream `final/` artifacts
- provider credential passing from the consumer
- access to Locus SQLite internals
- a complete OS sandbox

## Install and Locate the CLI

The packaged app includes a `locus` launcher. During development, this repo uses:

```bash
resources/cli/locus api runtimes list --json
```

For a packaged macOS app, the launcher is under the app resources directory:

```bash
/Applications/Locus.app/Contents/Resources/cli/locus api runtimes list --json
```

For Windows, use the packaged `locus.cmd` launcher from the app resources
directory. Source-level shim behavior is tested, but Windows packaged
real-machine smoke is explicitly deferred and is not required for current
source/macOS consumer integration.

Development smoke can override the headless executable:

```bash
LOCUS_HEADLESS_EXECUTABLE=/path/to/locus-electron-wrapper \
LOCUS_USER_DATA_DIR=/tmp/locus-api-profile \
resources/cli/locus api runtimes list --json
```

Production consumers should not set `LOCUS_HEADLESS_EXECUTABLE`. It exists for
local QA and packaging smoke.

## Command Reference

```bash
locus api runtimes list --json
locus api runs create --request <path|-> --json
locus api runs status <job-id> --json
locus api runs events <job-id> [--after <sequence>] [--follow] --jsonl
locus api runs result <job-id> --json
locus api runs cancel <job-id> --json
locus api runs retry <job-id> --json
```

Rules:

- JSON commands write parseable JSON to stdout.
- Event streams write one JSON object per line.
- Diagnostics and validation errors go to stderr.
- `--request -` reads the create request from stdin.
- `--after <sequence>` returns events with `sequence` greater than that value.
- `create` and `retry` run synchronously and return after the run reaches a
  terminal status.

## Minimal Consumer Flow

1. Build or locate a downstream package directory.
2. Ensure `project.cwd` points to a Locus-registered local project or a
   subdirectory inside one.
3. Put `artifacts.baseDir` inside `project.cwd`.
4. List runtime capabilities.
5. Create a run with `locus api runs create`.
6. Read `status`, `events`, and `result` by job ID.
7. Let the downstream app promote or copy final business artifacts only after
   its own user review.

## Runtime Capabilities

Check runtime capabilities before creating a job:

```bash
locus api runtimes list --json
```

Response shape:

```json
{
  "apiVersion": "locus.local-job.v1",
  "runtimes": [
    {
      "runtimeId": "codex",
      "capabilities": [
        {
          "id": "planMode",
          "state": "supported",
          "scope": "runtime",
          "reason": "..."
        }
      ]
    }
  ]
}
```

Use `runtime.requiredCapabilities` in the create request when the downstream
workflow depends on a capability. Locus rejects unsupported or degraded required
capabilities before provider work starts.

Common runtime IDs:

- `codex`
- `claude-code`
- `claude` as an accepted alias for `claude-code`

Common modes:

- `plan`
- `agent`

## Create Request

Example for a generic local package:

```json
{
  "apiVersion": "locus.local-job.v1",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "package-review-001"
  },
  "project": {
    "cwd": "/Users/alice/LocalPackages/example-package",
    "projectId": null
  },
  "runtime": {
    "id": "codex",
    "requiredCapabilities": ["planMode"]
  },
  "mode": "plan",
  "prompt": {
    "text": "Review this local package and produce a readiness note."
  },
  "input": {
    "contract": "example.local-package.v1",
    "packageDir": "/Users/alice/LocalPackages/example-package",
    "sourceMetadata": "source.json"
  },
  "artifacts": {
    "baseDir": "/Users/alice/LocalPackages/example-package/.locus/runs",
    "writePolicy": "metadata-only"
  }
}
```

Run it:

```bash
locus api runs create --request request.json --json
```

Or pipe it:

```bash
cat request.json | locus api runs create --request - --json
```

## Request Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `apiVersion` | yes | Must be `locus.local-job.v1`. |
| `consumer.id` | yes | Stable downstream app ID, such as `docs-workbench`. |
| `consumer.runExternalId` | no | Consumer-owned run ID for correlation. |
| `project.cwd` | yes | Absolute local path for the run. Must exist and be inside a registered Locus project. |
| `project.projectId` | no | Optional Locus project ID. If provided, `cwd` must be inside that project. |
| `runtime.id` | yes | `codex`, `claude-code`, or accepted alias `claude`. |
| `runtime.requiredCapabilities` | no | Capability IDs that must be supported before runtime work starts. |
| `mode` | yes | `plan` or `agent`. |
| `prompt.text` | yes | Prompt text. Max size is 256 KiB. |
| `input` | no | Consumer-owned structured metadata. Must not contain secrets. |
| `artifacts.baseDir` | no | Absolute directory for Locus run metadata. Must be inside `project.cwd`. |
| `artifacts.writePolicy` | no | `metadata-only` or `proposal-only`. Defaults to `metadata-only`. |

Identifier limits:

- `consumer.id`: 1-80 chars, letters, numbers, `.`, `_`, `:`, `-`
- `consumer.runExternalId`: 1-160 chars, same character set
- request JSON: max 1 MiB

## Artifact Contract

If `artifacts.baseDir` is set, Locus writes run-owned metadata here:

```text
<artifacts.baseDir>/<jobId>/
  request.json
  events.jsonl
  result.json
  artifacts.json
```

For a generic local package, the recommended layout is:

```text
example-package/
  source.json
  source.md
  notes.md
  drafts/
  final/
  .locus/
    runs/
      <jobId>/
        request.json
        events.jsonl
        result.json
        artifacts.json
```

Rules:

- `artifacts.baseDir` must be absolute.
- It must be inside `project.cwd`.
- It cannot be inside `.git`.
- It cannot be inside a path component named `final`.
- If it already exists, it must be a directory.
- Existing path components cannot be symlinks that escape the project.
- Locus does not promote output into downstream `final/` directories in v1.

Use `final/` only for downstream/user-approved material.

## Create Response

`create` returns a v1 envelope with the serialized job and final result:

```json
{
  "apiVersion": "locus.local-job.v1",
  "job": {
    "id": "mpzcxv3xp2ji1fl2",
    "source": "api",
    "runtime": "codex",
    "mode": "plan",
    "status": "succeeded",
    "apiConsumerId": "docs-workbench",
    "apiConsumerRunId": "package-review-001",
    "artifactManifestPath": "/.../.locus/runs/mpzcxv3xp2ji1fl2/artifacts.json"
  },
  "result": {
    "apiVersion": "locus.local-job.v1",
    "jobId": "mpzcxv3xp2ji1fl2",
    "status": "succeeded",
    "runtime": "codex",
    "mode": "plan",
    "consumer": {
      "id": "docs-workbench",
      "runExternalId": "package-review-001"
    },
    "artifactManifestPath": "/.../.locus/runs/mpzcxv3xp2ji1fl2/artifacts.json",
    "artifacts": [],
    "diagnostics": [],
    "result": {}
  }
}
```

The exact `job` object may include additional renderer-safe fields. Consumers
should require only fields documented in this guide.

## Status

```bash
locus api runs status <job-id> --json
```

Response:

```json
{
  "apiVersion": "locus.local-job.v1",
  "job": {
    "id": "mpzcxv3xp2ji1fl2",
    "source": "api",
    "status": "succeeded"
  }
}
```

Only `source=api` jobs can be read through `locus api runs ...`.

## Events

```bash
locus api runs events <job-id> --after 0 --jsonl
```

Each line is one event envelope:

```json
{"apiVersion":"locus.local-job.v1","jobId":"mpzcxv3xp2ji1fl2","sequence":1,"type":"job_created","createdAt":"2026-06-04T10:33:00.000Z","payload":{}}
```

Stable v1 event types:

- `job_created`
- `job_started`
- `assistant_delta`
- `reasoning_delta`
- `tool_started`
- `tool_delta`
- `tool_finished`
- `artifact_created`
- `status`
- `error`
- `completed`

Resume logic:

```text
lastSequence = 0
read events with --after lastSequence
for each event:
  process event
  lastSequence = event.sequence
repeat until job is terminal
```

Use `--follow` if you want the command to wait for new events until the job is
terminal.

## Result

```bash
locus api runs result <job-id> --json
```

Response:

```json
{
  "apiVersion": "locus.local-job.v1",
  "jobId": "mpzcxv3xp2ji1fl2",
  "status": "succeeded",
  "runtime": "codex",
  "mode": "plan",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "package-review-001"
  },
  "artifactManifestPath": "/.../.locus/runs/mpzcxv3xp2ji1fl2/artifacts.json",
  "artifacts": [
    {
      "role": "request",
      "path": "/.../request.json",
      "sha256": "...",
      "contentType": "application/json",
      "sizeBytes": 1234
    }
  ],
  "diagnostics": [],
  "result": {
    "finalMessage": "..."
  }
}
```

Read `diagnostics` before treating a non-success status as user-visible output.

## Cancel

```bash
locus api runs cancel <job-id> --json
```

Cancel is scoped to API jobs. A queued API job is completed as `canceled`
immediately. A running job receives a persisted cancel request that the runtime
runner observes.

## Retry

```bash
locus api runs retry <job-id> --json
```

Retry is allowed only for API jobs in terminal retryable states:

- `failed`
- `canceled`
- `interrupted`

`retry` creates a new API job, links it with `retryOfJobId`, prepares a new
artifact run directory, runs synchronously, and returns the same envelope shape
as `create`.

Do not use `locus jobs retry` for API jobs. That command is reserved for
non-API human-oriented job flows.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | Runtime failed. |
| `2` | Invalid arguments or invalid request/artifact contract. |
| `3` | Unsupported runtime, mode, or required capability. |
| `4` | Missing runtime credentials. |
| `5` | Job canceled. |
| `6` | Local-only guard blocked the run. |
| `7` | Invalid or unregistered `project.cwd`. |
| `8` | Internal failure. |

Consumers should parse stdout only when the exit code and command contract
allow it. Diagnostics are on stderr.

## Security Rules

Do not put these in the request:

- provider API keys
- OAuth tokens
- `Authorization` headers
- raw environment variables
- passwords
- private keys
- credential file contents

Locus resolves runtime credentials through its own main-process provider and
runtime setup paths. The consumer sends domain context, not provider secrets.

Secret-like keys or values are rejected before provider work starts.

## Integration Example

Recommended downstream app flow:

```text
1. User creates or reviews a local work package.
2. The downstream app creates a local package:

   packages/<example-package>/
     source.json
     source.md
     notes.md
     drafts/
     final/

3. The downstream app writes request.json with:
   project.cwd = packages/<example-package>
   input.packageDir = packages/<example-package>
   artifacts.baseDir = packages/<example-package>/.locus/runs

4. The downstream app runs:
   locus api runs create --request request.json --json

5. The downstream app reads result/artifacts/events.
6. The downstream app shows the user proposed output.
7. The downstream app writes or promotes final artifacts only after user approval.
```

Minimal shell example:

```bash
PACKAGE_DIR="$HOME/LocalPackages/example-package"
mkdir -p "$PACKAGE_DIR/.locus/runs" "$PACKAGE_DIR/drafts" "$PACKAGE_DIR/final"

cat > "$PACKAGE_DIR/request.json" <<EOF
{
  "apiVersion": "locus.local-job.v1",
  "consumer": {
    "id": "docs-workbench",
    "runExternalId": "example-package-001"
  },
  "project": {
    "cwd": "$PACKAGE_DIR"
  },
  "runtime": {
    "id": "codex",
    "requiredCapabilities": ["planMode"]
  },
  "mode": "plan",
  "prompt": {
    "text": "Review this local package and identify missing source material."
  },
  "input": {
    "contract": "example.local-package.v1",
    "packageDir": "$PACKAGE_DIR"
  },
  "artifacts": {
    "baseDir": "$PACKAGE_DIR/.locus/runs",
    "writePolicy": "metadata-only"
  }
}
EOF

locus api runs create --request "$PACKAGE_DIR/request.json" --json
```

`PACKAGE_DIR` must be inside a project already registered with Locus.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `project.cwd must be inside a registered project` | The package directory is not registered or not under a registered Locus project. | Open/register the project in Locus, or pass a cwd inside a registered project. |
| `artifacts.baseDir must be inside project.cwd` | Artifact base is outside the run cwd. | Use `<project.cwd>/.locus/runs`. |
| `artifacts.baseDir cannot be inside a final artifact directory` | Locus refuses to write metadata into downstream final material. | Move API metadata to `.locus/runs`. |
| `Unsupported runtime.id` | Runtime ID is not recognized. | Use `codex`, `claude-code`, or `claude`. |
| `Unsupported required capability` | Capability ID is unknown. | Inspect `locus api runtimes list --json`. |
| Exit `4` | Runtime credentials are missing. | Configure the runtime in Locus. Do not send credentials in the request. |
| JSON parse fails | The command may have failed and wrote diagnostics to stderr. | Check exit code and stderr before parsing stdout. |

## Stability Contract

Stable in v1:

- command names under `locus api`
- `apiVersion: locus.local-job.v1`
- documented request fields
- documented response envelopes
- documented event envelope fields
- run metadata artifact file names
- secret rejection boundary

Not stable in v1:

- extra fields inside serialized `job`
- internal SQLite schema
- internal event payload details beyond the v1 envelope
- Workbench rendering details
- human CLI formatting under `locus run` and `locus jobs`

Use the documented v1 fields and ignore unknown JSON fields.
