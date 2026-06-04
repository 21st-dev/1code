# Locus as a Local Agent Platform

Languages: English | [Simplified Chinese](locus-local-agent-platform.zh-CN.md)

Locus is moving from a coding-only desktop app toward a local-first AI
workbench and agent runtime hub.

![Locus target local agent platform](assets/locus-agent-platform.svg)

## Positioning

Locus should own the local runtime layer:

- runtime setup and capability truth for Claude Code and Codex
- local job creation, event logs, cancellation, retry, and recovery
- desktop visibility and user control
- headless CLI entry points
- daemon-backed background work
- opt-in local schedules
- narrow protocol entry points for external clients

Coding is still the first strong workflow, but it is not the only long-term
workflow. Other local-first tools can use Locus as the place where AI work is
run, tracked, observed, and controlled.

## Main Status

This document describes the product direction for `main`. The durable job
platform work exists on a headless branch and should not be described as merged
or released until that branch is reviewed and merged into `main`.

| Surface | Use it for | Main status |
| --- | --- | --- |
| Desktop Workbench | Inspect local desktop tasks from the UI | Implemented |
| `locus run` | One-shot local tasks | Headless branch; pending main merge |
| `locus jobs` | List, show, logs, cancel, retry | Headless branch; pending main merge |
| `locus run --daemon` | Submit queued background work | Headless branch; pending main merge |
| `locus daemon run` | Claim daemon and schedule jobs | Headless branch; pending main merge |
| `locus schedules` | Create, pause, resume, delete, and run local schedules | Headless branch; pending main merge |
| `locus acp` | Minimal stdio protocol for job-backed runs | Experimental on headless branch |

The headless branch has local macOS smoke evidence and source-level Windows shim
tests, but packaged Windows real-machine smoke is still pending. Do not describe
the job platform as cross-platform accepted until that evidence exists and the
implementation is merged.

## Safety and Privacy Boundaries

Local-first means Locus stores jobs, event logs, settings, and project state
locally by default. It does not mean offline-only. Prompts, selected file
content, diffs, audio, tool context, or metadata may still be sent to the
user-selected runtime, provider, MCP server, or GitHub workflow.

Locus is not an OS sandbox. Terminal, git, filesystem, MCP, runtime tools, and
future computer-control flows can affect the local machine when authorized or
invoked. Describe supported safeguards as project/worktree-aware controls, not
as complete filesystem isolation.

Provider credentials should be resolved in the main process and renderer APIs
should receive only IDs, status, and redacted metadata. Job payloads, event
logs, ACP requests, and downstream integration payloads must not carry provider
secrets. Current exception: voice OpenAI key storage still needs hardening before
Locus can claim all API keys are encrypted in main-process secure storage.

## Recommended Integration Model

Downstream projects should call Locus at the job boundary instead of embedding
Claude Code or Codex CLIs directly.

![Downstream projects use the Locus job boundary](assets/locus-downstream-integrations.svg)

Recommended shape:

```text
Downstream app
  -> Locus CLI or future Local Job API
  -> Locus Job Platform
  -> AgentRuntime adapter
  -> Claude Code / Codex
```

The downstream app should own its domain state and final user-facing workflow.
Locus should own execution, logs, runtime capability checks, cancellation,
background queueing, and local auditability.

## Example Downstream Projects

These are intended integration patterns, not claims that all integrations are
already implemented.

### Local Job Search Assistant

A job-search app can keep resumes, cover letters, decisions, and submitted
artifacts in its own local workspace while using Locus to run review and draft
jobs.

Good first integration:

```text
visible job page / local package
  -> create Locus job
  -> stream job events
  -> write reviewed draft only after user confirmation
```

### Calendar and Planning Assistant

A calendar/planning tool can use daemon-backed schedules for recurring review
or planning jobs, but should default to plan/review mode and require explicit
approval before mutating calendar data.

Good first integration:

```text
local schedule
  -> queued Locus job
  -> plan or review output
  -> explicit user approval
  -> downstream app writes calendar changes
```

### Computer Operation Workbench

A computer-operation project can use Locus as the runtime/job layer, but it
must treat screen control, filesystem mutation, shell commands, and credentials
as separate high-risk capability gates.

Good first integration:

```text
external control app
  -> Locus job with declared capability needs
  -> explicit user-visible permission gates
  -> event log and cancel path stay in Locus
```

## What Locus Should Not Claim Yet

Do not claim these as implemented:

- full ACP compatibility
- hosted cloud agents
- hosted or OS-level scheduling
- full Claude Code and Codex behavior parity
- generic safe retry for desktop chat jobs
- automatic computer control without explicit permission gates
- a security sandbox for arbitrary plugin or runtime code
- cross-platform packaged acceptance before Windows real-machine smoke
- offline-only or fully private execution
- complete filesystem isolation
- all API keys encrypted in main-process secure storage while the voice-key
  hardening gap remains

## Protocol Strategy

The headless branch's `locus acp` surface is intentionally small. It is a
minimal stdio job adapter, not a full ACP server. It should only become a `main`
claim after the headless branch is reviewed and merged.

Full ACP parity should be a separate project with explicit protocol, session,
permission, MCP, reconnect, and compatibility tests.

The recommended next platform boundary is a Locus-owned Local Job API v1. ACP
can then be one adapter over that stable local API rather than the only platform
interface.

## Local Job API v1 Direction

This is a future direction, not an implemented API contract.

Minimum useful operations:

- create a job with runtime, mode, cwd, prompt, source, and optional project link
- read job status
- stream events after a sequence number
- cancel a job
- retry a retryable job
- list runtime capabilities
- reject unsupported capabilities before runtime work starts
- keep stdout/stdin protocol modes machine-readable
- keep provider secrets out of request payloads, event logs, and renderer data

## Roadmap

Recommended order:

1. Review the headless branch before merging the local job platform into `main`.
2. Finish Windows packaged real-machine smoke for `run`, `jobs`, daemon,
   schedules, ACP, exit codes, stdout/stderr, and Workbench visibility.
3. Harden documentation and release wording so local macOS completion is not
   confused with cross-platform release readiness.
4. Define Local Job API v1 as an OpenSpec proposal.
5. Let downstream projects integrate through the job boundary after the job
   platform is merged.
6. Add stronger capability and permission gates for non-coding domains.
7. Add full ACP parity only when a real external client needs standard ACP
   session/protocol behavior.
8. Add hosted or OS-level scheduling only after the local daemon and job
   recovery model are stable on both macOS and Windows.

## Documentation Rule

Public wording should describe implemented evidence, not aspiration.

Use:

```text
local-first AI workbench
local job platform direction
runtime hub for Claude Code and Codex powered work
headless branch has macOS local smoke; Windows real-machine smoke pending
```

Avoid:

```text
complete ACP server
universal automation platform
fully cross-platform accepted
secure sandbox for arbitrary extensions
offline-only
fully private
all API keys encrypted
complete filesystem isolation
main already has headless jobs before the headless branch is merged
Claude and Codex parity
cloud agent platform
```
