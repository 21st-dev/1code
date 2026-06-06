# Locus Workbench Focus and Scope Lock

Languages: English | [Simplified Chinese](locus-workbench-focus.zh-CN.md)

## Stable Positioning

Locus is an AI workbench that runs mature agent CLI workflows through selectable
model backends. It shows runtime capabilities, provider compatibility, MCP
state, tool activity, file changes, usage, and run history in one desktop
workspace.

The headline product is the visible workbench. Runtime adapters, provider
profiles, gateway routing, local jobs, daemon, schedules, and protocol surfaces
are supporting infrastructure. They should not become the product identity.

Do not describe Locus as an AI OS, generic workflow orchestrator, local job
platform, or runtime hub as the main positioning.

## Current Foundation

The current codebase already has enough foundation to stop expanding sideways:

- runtime adapters exist for Claude Code and Codex, with capability manifests
  and run gates
- local job infrastructure exists for `locus run`, `locus jobs`, daemon,
  schedules, API runs, status, events, cancel, retry, and heartbeat
- provider profiles and the provider gateway already model third-party or local
  model backends without sending provider secrets to the renderer
- the current Codex desktop path is stronger than headless Codex because it
  already has provider profile binding, MCP integration, streaming, usage, and
  session metadata, but its ACP transport is a compatibility path, not the
  long-term desktop/chat target
- the headless Codex path is still thin because `codex exec` output is mostly
  normalized from stdout and stderr rather than rich runtime events

The next step is not to add more runtimes. The next step is to make the existing
CLI workflows understandable, selectable, diagnosable, and observable.

## Current Cut

The next product slice is:

```text
Codex CLI workflow + provider profile backend + capability display + run trace
```

Keep the slice to four issues:

1. Runtime Capability Panel
   Surface the existing capability manifest in the UI with supported,
   degraded, and unsupported states, including reasons and hints.

2. Provider Profile Run Binding
   Make model, provider profile, backend label, protocol, and gateway kind part
   of run metadata and job history. A run should say "Codex + DeepSeek +
   responses gateway", not only "Codex".

3. Codex Workbench Run Trace
   Build the trace contract for the app-server desktop/chat target. The current
   ACP path may only feed temporary migration comparison data while app-server is
   proven. Show provider selection, MCP state, tool and command activity, file
   changes, usage, session ID, duration, and final state as structured timeline
   data.

4. Headless Parity Later
   Keep `codex exec` and process-runner output as fallback or batch mode for
   now. Rich JSON or JSONL parsing for headless parity is a later slice after
   the workbench trace is proven.

Provider diagnostics and run preflight belong inside the first two issues. They
must answer whether the selected runtime plus provider profile can run, stream,
use tools, load MCP, and report usage before the user starts work.

## Scope Rules

Allow work now only when it directly improves the current cut:

- shows runtime capability truth
- binds provider profile and model metadata to an actual run
- makes Codex workbench execution visible and diagnosable
- records run trace, usage, errors, and file/tool activity accurately
- keeps provider secrets in the main process and renderer data redacted

Park work when it does not fit that slice, even if it is useful later:

- third or fourth agent CLI integrations
- broad Claude expansion before the Codex workbench is coherent
- generic workflow engines
- AI OS positioning
- computer-use or screen-control features
- plugin marketplace work
- all-model benchmarking
- full hosted or headless SaaS
- ACP as a final product target
- durable workflow management

## Active Proposal Triage

`openspec/changes/add-claude-dynamic-workflows-adapter` is proposal-only and
parked behind this focus cut. It may remain as a scoped Claude-specific adapter
proposal, but it is not the next implementation slice and must not be described
as supported.

Implementing that proposal requires separate approval after the Codex Workbench
focus is complete or deliberately reprioritized.

## Documentation Rule

Use:

```text
local-first AI workbench
selectable model backends
runtime capability truth
provider compatibility and diagnostics
MCP state, tool activity, file changes, usage, and run history
Local Job API as supporting automation infrastructure
codex app-server for desktop/chat
codex exec for headless/batch
temporary ACP compatibility fallback only during migration
```

Avoid as headline positioning:

```text
AI OS
local job platform
runtime hub
workflow orchestrator
complete ACP server
ACP as the long-term Codex adapter
universal automation platform
computer-control platform
Claude and Codex parity
cloud agent platform
offline-only
fully private
complete filesystem isolation
```
