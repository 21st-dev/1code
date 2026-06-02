## Context
Locus is a local-first Electron desktop app with the main process owning native APIs, credential handling, provider startup, filesystem access, SQLite, and tRPC routers. Current Claude and Codex execution logic lives primarily in `src/main/lib/trpc/routers/claude.ts` and `src/main/lib/trpc/routers/codex.ts`. The existing `resources/cli/locus` script only opens the desktop app with a directory argument; it is not a headless runner.

Headless in this project means "agent capability without requiring the GUI." CLI is only one entry surface. The final shape should let desktop UI, CLI, daemon, schedules, and protocol clients call the same local runner core.

## MVP Boundary
This change implements Phase 1 and Phase 2 only:
- Phase 1: one-shot `locus run` through the shared runner core with durable job/event persistence.
- Phase 2: `locus jobs` inspection/cancel/retry commands and desktop visibility for persisted jobs.

Daemon, schedules, and `locus acp` remain future follow-up proposals. This OpenSpec may describe their compatibility boundaries, but they are not required to complete or archive this change.

The first implementation must support both macOS and Windows. If a platform
cannot pass the same `locus run` / `locus jobs` smoke contract, the change is
not complete. Linux support may follow the macOS shell-shim pattern where the
packaging target exists, but the required first-slice platforms are macOS and
Windows.

The first implementation did not migrate ordinary desktop chat streaming into
`agent_jobs`; CLI/headless jobs were the first persisted job source. Phase 5
adds ordinary desktop chat as `source=desktop` jobs after the headless slice is
stable enough on macOS. This phase still must not describe the first slice as
release-ready until the Windows headless smoke evidence is collected.

Phase 5 migrates the outer job lifecycle only. It must preserve the existing
desktop chat message, session, stream, rollback, guarded-run, attachment, and
runtime-specific behavior. Claude Code and Codex keep their current chat
routers and transports; the job platform records and controls each desktop chat
run around those existing paths.

## Reference Integration Strategy
The reference projects influence separate layers:

- Codex CLI: use the `core` / `exec` / UI split as the structural model. Locus should extract an `agent-runtime` core before adding CLI behavior.
- Claude Code: use the `-p` headless contract as CLI UX guidance: stdin support, structured output, explicit tool/permission settings, continuation, and clear exit codes.
- Goose: use the shared session/job management idea across desktop, CLI, and schedules. Locus should make CLI-created jobs visible in the desktop app and desktop-created jobs inspectable from CLI.
- OpenHands: use runtime abstraction as the long-term execution boundary. Locus should start with local process/worktree execution and leave room for a future container runtime without building Docker into the MVP.
- ACP: shape internal events so they can map to `session/new`, `session/prompt`, `session/update`, and `session/cancel` later. Do not implement `locus acp` until local jobs are stable.

Reference links:
- OpenAI Codex Rust CLI README: https://github.com/openai/codex/blob/main/codex-rs/README.md
- Claude Code headless usage: https://code.claude.com/docs/en/headless
- Goose CLI commands: https://goose-docs.ai/docs/guides/goose-cli-commands/
- OpenHands runtime README: https://github.com/OpenHands/OpenHands/blob/main/openhands/runtime/README.md
- Agent Client Protocol overview: https://agentclientprotocol.com/protocol/overview
- Agent Client Protocol transports: https://agentclientprotocol.com/protocol/transports

## Goals / Non-Goals
- Goals:
  - Provide a local one-shot headless runner first.
  - Persist job state and event logs in SQLite.
  - Reuse Claude/Codex runtime integrations through a shared main-process runner core.
  - Make CLI and desktop job surfaces reflect the same local truth.
  - Preserve local-only and credential boundaries.
  - Keep future daemon, schedule, and ACP compatibility possible without forcing them into the MVP.
- Non-goals:
  - Hosted queue or cloud background agents.
  - Multi-device sync, remote mobile control, or remote browser control.
  - Broad sandbox/container implementation in the first slice.
  - A new generic workflow engine unrelated to coding-agent chats.

## Proposed Architecture

Capability vocabulary, runtime IDs, static Claude/Codex manifests, and generic
capability gating helpers are owned by
`add-agent-runtime-capability-model`. This headless jobs change consumes that
model instead of redefining capability states or deciding Claude/Codex parity.

### Layer 1: Agent Runtime Core
Add `src/main/lib/agent-runtime/` with:
- `contract.ts`: the `AgentRuntime` interface, shared capability manifest references, run request, observer, result, status, session reference, and cancellation types.
- `runtime-registry.ts`: registration and lookup for Claude and Codex drivers, reusing capability summaries safe to expose to the renderer.
- `types.ts`: shared runtime-neutral event, result, status, and serialization types when those grow beyond the contract file.
- `runner.ts`: common `runAgentTask(request, observer, abortSignal)` entry point.
- `claude-adapter.ts`: adapter around existing Claude Code execution.
- `codex-adapter.ts`: adapter around existing Codex/ACP execution.
- `events.ts`: normalized event helpers and serialization.

The first implementation should extract narrow seams from the existing routers instead of moving all router code at once. The routers may remain as callers while the core stabilizes.

The shared contract is intentionally small. It unifies job management, not
runtime behavior. The required cross-runtime surface is:
- runtime ID and capability manifest
- `run(request, observer, abortSignal)`
- normalized events and result status
- best-effort cancellation through the shared abort signal

The shared contract must not require every runtime to implement rollback, fork,
dynamic workflows, runtime plugins, runtime commands, full MCP configuration,
or runtime-specific session semantics. Those behaviors remain capability-gated
and runtime-specific until a runtime reports `supported` with implementation
evidence.

The contract must be capability-first, not provider-name-first. A runtime driver describes what it can actually enforce:

- `hardToolGuard`: whether tool calls can be allowed, denied, or rewritten before execution.
- `planMode`: whether read-only or plan-safe behavior is enforced by the runtime adapter rather than prompt text alone.
- `scopeExpansion`: whether a run can request approval before crossing a declared scope.
- `askUserQuestion`: whether the runtime can pause for user input and resume with structured answers.
- `rollback`: whether resume, rollback, and fork semantics are supported with durable session references.
- `mcpAuth`: whether MCP server auth state can be detected, refreshed, and surfaced before a run.
- `mcpConfiguration`: whether runtime MCP add/remove/list supports the same app-level and project-level configuration scopes.
- `providerProfiles`: whether profile-backed model/provider routing is supported without exposing secrets to the renderer.
- `attachments`: whether image and long-text attachments are supported for that runtime path.
- `usageMetadata`: whether context/token usage can be reported after or during a run.
- `runtimePlugins`: whether runtime plugin install, enablement, disablement, discovery, and executable surfaces are available through a real runtime-native or product-owned integration.
- `runtimeCommands`: whether runtime command discovery and execution are available as chat/job commands rather than only indexed documentation.
- `runtimeWorkflows`: whether dynamic workflow execution is runtime-neutral or has a runtime-native equivalent for the selected runtime.
- `appAgents`: whether App Agent instructions, registry sources, and runtime-specific agent/skill imports are normalized for the selected runtime.

Each capability status, scope, reason, and remediation hint comes from the shared runtime capability model. UI and CLI surfaces must use that manifest to decide which controls are visible, disabled, or warned about. They must not infer support from runtime name alone.

### Codex Capability Honesty Boundary
This change registers Codex through the same `AgentRuntime` registry and event contract as Claude, but it does not require Codex to reach Claude Code behavior parity before local headless jobs can ship.

Codex is valid for this slice when the adapter:

- Registers the same capability names as Claude.
- Emits normalized request, event, cancellation, error, and completion shapes for behavior it actually supports.
- Marks missing or partial behavior as `degraded` or `unsupported` with a clear reason.
- Lets desktop and CLI callers gate controls, modes, and command options from capability state before starting provider work.
- Does not use prompt-only guidance, indexed documentation, or UI similarity to claim a capability is supported.

The work to make Codex behavior-equivalent to Claude Code is split into `upgrade-codex-runtime-parity`. That follow-up owns hard tool guard enforcement, plan mode enforcement, scope expansion, AskUserQuestion, rollback/fork, MCP auth/configuration, runtime plugins, runtime commands, runtime workflows, App Agents/skills, provider profiles, usage metadata, and attachments.

### Layer 2: Durable Local Jobs
Add `src/main/lib/headless/` with:
- `job-store.ts`: SQLite reads/writes for `agent_jobs` and `agent_job_events`.
- `job-runner.ts`: create, start, cancel, retry, and mark-interrupted orchestration.
- `cli-output.ts`: text, JSON, and stream JSON formatting helpers.
- `daemon.ts`: future local daemon boundary, not in the first slice.

SQLite tables should record job metadata separately from event payloads so list views are cheap and detailed logs remain append-only.

Suggested job fields:
- `id`
- `retry_of_job_id`
- `attempt`
- `source`: `desktop` | `cli` | `daemon` | `schedule` | `protocol`
- `runtime`: `claude` | `codex`
- `status`: `queued` | `running` | `succeeded` | `failed` | `canceled` | `interrupted`
- `mode`: `plan` | `agent`
- `cwd`
- `project_id`
- `chat_id`
- `sub_chat_id`
- `prompt_preview`
- `created_at`
- `started_at`
- `finished_at`
- `exit_code`
- `error_code`
- `error_message`
- `created_by_version`
- `worker_id`
- `worker_pid`
- `worker_started_at`
- `heartbeat_at`
- `cancel_requested_at`
- `cancel_requested_by`

Suggested event fields:
- `id`
- `job_id`
- `sequence`
- `type`
- `payload_json`
- `created_at`

Suggested event types:
- `job_created`
- `job_started`
- `assistant_delta`
- `reasoning_delta`
- `tool_started`
- `tool_delta`
- `tool_finished`
- `status`
- `permission_requested`
- `error`
- `completed`

Each event payload should include only sanitized runtime data. File paths should be absolute in persisted payloads when practical, while renderers may derive project-relative labels. Provider tokens, OAuth credentials, API keys, and raw request headers must not be stored in event payloads.

SQLite is shared by the GUI process and headless CLI processes in this slice.
The job store must use WAL, a non-zero busy timeout, short write
transactions, and append-only event writes. Event sequence numbers must be
monotonic per job and protected by a unique `(job_id, sequence)` constraint or
an equivalent transaction-safe allocator.

Cancellation is a persisted request before it is a terminal status:
- `cancel_requested_at` means a user or caller has asked the worker to stop.
- `canceled` means the active worker observed the request and stopped the runtime.
- `interrupted` means the worker disappeared, the process exited unexpectedly,
  or a running job lost its heartbeat.
- `failed` means the runtime or job runner reached a normal error path.

The job runner must heartbeat active jobs and mark stale `running` jobs as
`interrupted` during startup or explicit recovery. This worker lease shape is
required before a daemon is introduced so daemon work can reuse it instead of
inventing a second recovery model.

CLI-created jobs may link to an existing project, chat, or sub-chat when the
mapping is cheap and unambiguous, but the first slice must not require CLI jobs
to create or mutate chat/sub-chat records. The durable job record is the source
of truth for headless history.

### Layer 3: CLI Front Door
Upgrade `resources/cli/locus` and Windows equivalent into a command dispatcher:
- `locus open [dir]`: current launcher behavior.
- `locus run --cwd <path> --runtime <claude|codex> --mode <plan|agent> --prompt <text>`.
- `locus run --stdin --output text|json|stream-json`.
- `locus jobs list`.
- `locus jobs show <job-id>`.
- `locus jobs logs <job-id> --follow`.
- `locus jobs cancel <job-id>`.
- `locus jobs retry <job-id>`.

The packaged CLI is a thin command dispatcher. For `run` and job-management commands that need the app database, migrations, credentials, native modules, or packaged runtime binaries, it launches the Locus Electron main process in headless CLI mode. The main process must detect the headless CLI command before creating a BrowserWindow, execute the command in the main process, write CLI output to stdout/stderr, and exit with the command's status code. This keeps `app.getPath("userData")`, safeStorage, bundled binaries, provider profile resolution, and local-only guards consistent with the desktop app.

For development, an equivalent script may launch Electron with the same headless CLI arguments. Do not implement `locus run` as an independent Node script that imports only part of the main-process stack or writes to an alternate database path.

The first slice runs directly in one-shot headless Electron mode without daemon handoff. Daemon enqueue becomes a later phase after job persistence is proven.

Headless CLI mode must be detected before normal GUI single-instance behavior,
menu construction, BrowserWindow creation, updater startup, auth callback
server startup, and GUI-only MCP warmup. GUI launches keep the existing
single-instance behavior. Headless launches must not focus or create a GUI
window merely because another GUI instance is already running.

On macOS, `locus run` and `locus jobs` must not use `open -a` because that
route can detach from the terminal and/or forward arguments to an existing GUI
instance. The shim should resolve and execute the packaged app binary directly
with a private headless marker argument, preserving stdout, stderr, stdin, and
exit code.

On Windows, `locus run` and `locus jobs` must not use `start` because it
detaches from the calling terminal. The `.cmd` shim must synchronously invoke
the packaged executable with the same private headless marker argument and
return the process exit code to the caller.

### CLI Output and Exit Codes
`text` output may render human-readable assistant and tool progress. `json` output returns a single final object with `job`, `status`, `result`, and `error` fields. `stream-json` writes one newline-delimited JSON object per job event and a final result object. In JSON modes, stdout is reserved for structured payloads and diagnostics go to stderr.

In `json` and `stream-json` modes, stdout must contain only the declared JSON
payloads. App diagnostics, migration logs, provider setup messages, warning
text, and smoke/debug output must be routed to stderr or suppressed. This is a
scriptability requirement, not a presentation preference.

Exit codes:
- `0`: job succeeded
- `1`: runtime failed
- `2`: invalid CLI arguments or unsupported option combination
- `3`: unsupported runtime or mode
- `4`: missing or unavailable credentials/provider configuration
- `5`: canceled by user
- `6`: blocked by local-only guard
- `7`: invalid or inaccessible cwd
- `8`: local database, migration, filesystem, or internal process failure

### Layer 4: Desktop Job UI
Add a job-aware surface inside the existing agents/workbench area:
- active and recent jobs list
- status filters
- job detail with event stream/logs
- cancel/retry controls
- open linked chat/sub-chat
- reconnect indicator for jobs created outside the renderer

This should reuse the existing Agent Workbench where practical rather than creating a separate top-level product island.

### Layer 5: Desktop Chat Job Migration
Phase 5 turns ordinary desktop chat sends into `source=desktop` jobs without
replacing the chat engine.

The intended shape is:

```text
Desktop chat UI
  -> existing Claude/Codex chat transport
  -> existing main-process Claude/Codex chat router
  -> source=desktop agent job wrapper
  -> existing runtime-specific execution path
```

The job wrapper owns only:
- creating a linked `agent_jobs` row for each desktop chat run
- starting and completing that job around the existing stream lifecycle
- appending sanitized lifecycle events
- linking job rows to `project_id`, `chat_id`, and `sub_chat_id`
- routing Workbench/job cancellation to the matching active desktop stream
- marking a run `canceled`, `failed`, `succeeded`, or `interrupted` from the
  actual stream outcome

The job wrapper must not own:
- chat transcript rendering or message persistence
- Claude Code session IDs or Codex ACP session IDs
- stream IDs used by the current desktop chat UI
- rollback/fork internals
- guarded-run enforcement internals
- runtime plugin, MCP, provider-profile, or tool-call semantics

The existing `sub_chats.messages`, `sub_chats.session_id`, and
`sub_chats.stream_id` records remain the source of truth for ordinary chat
transcripts in this phase. The linked `agent_jobs` row is the source of truth
for cross-entrypoint status, audit events, cancel requests, and later daemon or
protocol compatibility.

Desktop job retry is intentionally narrower than CLI retry. A failed desktop
chat job may remain inspectable, but generic job retry must not blindly append
another user message or create an orphan run. Until chat-safe retry semantics
are implemented, the desktop UI should send the user back to the linked chat to
retry manually.

Desktop cancellation has two entry points:
- the existing chat stop control
- Agent Workbench job cancellation

Both must converge on the same active stream and persisted job cancellation
request. A Workbench cancellation should not cancel a newer stream in the same
sub-chat merely because an older job row shares the same chat IDs.

### Layer 6: Daemon, Schedule, Protocol
After one-shot and durable jobs are stable:
- Local daemon: accepts enqueue/cancel/log follow requests over a local-only channel.
- Schedule: opt-in local schedules that create jobs; disabled by default and visible in the app.
- ACP-compatible protocol: `locus acp` over stdio, mapping internal job/session events to ACP-style JSON-RPC messages.

## Decisions

### One Change, Multiple Capabilities
Decision: use one OpenSpec change with multiple capability deltas.

Why: runtime core, jobs, desktop visibility, and future protocol shape are tightly coupled. Splitting them into separate independent proposals would make it easy to approve incompatible pieces.

### One-Shot Before Daemon
Decision: implement `locus run` one-shot before daemon/queue/reconnect.

Why: one-shot validates runner extraction, CLI argument semantics, output formats, credential boundaries, and runtime event normalization with lower operational risk.

### Headless Electron Main as CLI Host
Decision: `locus run` uses the Electron main process in a headless CLI mode instead of a standalone Node-only runner.

Why: this repo's database path, encrypted credential access, packaged binaries, local-only guard behavior, and runtime setup live in the main process. A Node-only CLI would either duplicate that behavior or drift from the desktop app.

### Headless Mode Before GUI Single-Instance
Decision: headless CLI mode is parsed before the GUI single-instance lock and
window lifecycle.

Why: `locus run` is a terminal command with stdout, stderr, stdin, and exit-code
semantics. Treating it as a second GUI launch would either quit under the
existing single-instance guard or focus the desktop app instead of running the
requested job.

### SQLite as Source of Truth
Decision: persist jobs and events in the existing app SQLite database.

Why: Locus already uses local SQLite for projects, chats, sub-chats, provider config, and app agents. A second storage path would split local truth and make desktop/CLI consistency harder.

### Worker Lease Before Daemon
Decision: add worker identity, process ID, heartbeat, cancel request, and stale
worker interruption semantics in the first job-store implementation.

Why: GUI and headless CLI processes can already overlap before a daemon exists.
Adding daemon later without a persisted worker lease would force a second
recovery model and make cancellation ambiguous.

### Runtime Core Before CLI Behavior
Decision: extract a small runner core before making `resources/cli/locus` directly execute agent work.

Why: CLI should not duplicate Claude/Codex runtime logic or bypass settings, local-only guard behavior, provider profiles, MCP setup, or cancellation semantics.

### Job Platform, Not Runtime Merger
Decision: Locus unifies job creation, status, event persistence, cancellation
requests, retries, and visibility. It does not merge Claude Code and Codex into
one runtime behavior model.

Why: Claude and Codex have different CLI/SDK/ACP primitives. The adapter layer
normalizes only the job-facing contract and leaves runtime-specific behavior
behind capability gates.

### Desktop Chat Uses Job Wrapper, Not Router Replacement
Decision: ordinary desktop chat becomes `source=desktop` by wrapping the
existing Claude/Codex stream routers with job lifecycle calls.

Why: the desktop chat path already owns UI streaming, transcript persistence,
session IDs, tool approval, rollback, guarded-run, attachments, and runtime
specific error handling. Replacing those internals in one step would risk
breaking normal chat. The job wrapper gives later daemon/schedule/protocol work
a common audit and cancellation surface while preserving today UI behavior.

### Capability-Driven UI Before Provider Branching
Decision: desktop and CLI controls should consume registered runtime capabilities instead of branching directly on `provider === "claude-code"` or `provider === "codex"` for feature availability.

Why: Locus should not keep encoding Claude as the implicit full-feature runtime. Capability-driven behavior lets Codex become usable incrementally while keeping unsupported or degraded features visible and honest.

### Hard Tool Guard Is an Enforcement Claim
Decision: a runtime may report `hardToolGuard: supported` only when the adapter can make an allow/deny/rewrite decision before the tool executes.

Why: prompt-only constraints and post-run audits are useful, but they are not equivalent to Claude Code's `canUseTool` enforcement. In this change, a runtime that lacks pre-tool enforcement must mark hard tool guard as `degraded` or `unsupported`; making Codex equivalent is owned by `upgrade-codex-runtime-parity`.

### Protocol-Shaped Events, Not Protocol-First
Decision: normalize events using names and payloads that can map to ACP later, but defer an external `locus acp` command.

Why: protocol compatibility is useful, but implementing a public protocol before local jobs work would expand the surface area prematurely.

### Local Process Runtime First
Decision: support local process/worktree execution first. Container runtime remains a future extension point.

Why: Locus is already a local desktop app with local git/worktree and terminal behavior. Container isolation is useful but should be justified by a later security or reproducibility requirement.

## Risks / Mitigations
- Existing Claude/Codex routers are large and stream-oriented.
  - Mitigation: extract a narrow adapter seam first, keep router behavior stable, and add tests for normalized events.
- Capability manifests can drift from real adapter behavior.
  - Mitigation: add adapter contract tests that assert declared capabilities are exercised or explicitly degraded.
- Codex ACP may not expose all tool interception hooks needed for Claude-level hard guards.
  - Mitigation: keep Codex capability states honest in this slice, gate UI/CLI behavior from those states, and move behavior parity work to `upgrade-codex-runtime-parity`.
- Long-running jobs may outlive renderer subscriptions.
  - Mitigation: append events to SQLite before notifying observers; desktop subscriptions can reconnect from the last sequence.
- CLI can accidentally expose secrets through shell history.
  - Mitigation: forbid provider tokens in CLI flags; use existing encrypted provider/profile storage and environment-backed runtime behavior only where already supported.
- GUI and headless processes can contend for SQLite writes.
  - Mitigation: use WAL, busy timeout, short write transactions, and per-job event sequence constraints.
- Detached platform shims can break structured output.
  - Mitigation: macOS and Windows shims must synchronously execute the packaged binary for headless commands and preserve stdout, stderr, stdin, and exit codes.
- Daemon startup can introduce lifecycle bugs.
  - Mitigation: keep one-shot direct execution as Phase 1; add daemon only after durable jobs and CLI smoke pass.
- Job events can grow without bound.
  - Mitigation: store compact structured events, cap list queries, and add cleanup/export behavior in a later maintenance slice.
- Desktop job retry can duplicate chat history if treated like CLI retry.
  - Mitigation: keep generic retry disabled for `source=desktop` jobs until
    chat-safe retry is designed; direct users to the linked chat instead.
- Workbench cancellation can target the wrong desktop stream if it only uses
  `sub_chat_id`.
  - Mitigation: register active desktop job IDs in memory and cancel by active
    job ownership, not only by chat or sub-chat identity.
- Schedule can create surprising autonomous edits.
  - Mitigation: schedule is opt-in, local-only, visible, pausable, and defaults to plan/review-oriented modes unless the user explicitly selects agent mode.

## Phase Gates
- First-slice gate is complete when `locus run` can execute one task, stream output, return an exit code, persist a job/event transcript, `locus jobs` can list/show/logs/cancel/retry persisted jobs, and desktop can display CLI-created jobs.
- User-roadmap Step 5 is complete when ordinary desktop chat runs are visible as linked `source=desktop` jobs without regressing existing chat behavior.
- User-roadmap Step 6 is complete when a local daemon can enqueue and run jobs without a renderer window while preserving crash/interrupted states.
- User-roadmap Step 7 is complete when schedules can create visible local jobs and `locus acp` can serve a minimal ACP-compatible stdio session backed by the same runner core.

For this implementation pass, "complete the first four steps" means:
- Phase 0 planning boundary is updated and validated.
- Job database/state-machine foundation is implemented and tested.
- macOS and Windows CLI/headless startup paths are implemented and tested.
- Claude and Codex basic headless runs use the shared job platform.
- Desktop job visibility/actions are implemented for CLI/headless jobs.

It does not mean daemon, schedule, ACP server, or ordinary desktop chat
migration are complete.

For the later Phase 5 desktop-chat implementation pass, "complete desktop chat
migration" means:
- ordinary Claude Code desktop sends create linked `source=desktop` jobs
- ordinary Codex desktop sends create linked `source=desktop` jobs
- current chat messages, sessions, stream IDs, attachments, guarded-run, and
  runtime-specific UI behavior continue to use the existing paths
- Workbench shows desktop chat runs separately from CLI/headless jobs
- Workbench cancellation reaches the exact active desktop run
- generic retry is not exposed for desktop chat jobs until chat-safe retry is
  implemented
- tests and smoke evidence prove both normal chat behavior and job visibility
