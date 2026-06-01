## Context
Locus is a local-first Electron desktop app with the main process owning native APIs, credential handling, provider startup, filesystem access, SQLite, and tRPC routers. Current Claude and Codex execution logic lives primarily in `src/main/lib/trpc/routers/claude.ts` and `src/main/lib/trpc/routers/codex.ts`. The existing `resources/cli/locus` script only opens the desktop app with a directory argument; it is not a headless runner.

Headless in this project means "agent capability without requiring the GUI." CLI is only one entry surface. The final shape should let desktop UI, CLI, daemon, schedules, and protocol clients call the same local runner core.

## MVP Boundary
This change implements Phase 1 and Phase 2 only:
- Phase 1: one-shot `locus run` through the shared runner core with durable job/event persistence.
- Phase 2: `locus jobs` inspection/cancel/retry commands and desktop visibility for persisted jobs.

Daemon, schedules, and `locus acp` remain future follow-up proposals. This OpenSpec may describe their compatibility boundaries, but they are not required to complete or archive this change.

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

### Layer 1: Agent Runtime Core
Add `src/main/lib/agent-runtime/` with:
- `contract.ts`: the `AgentRuntime` interface, runtime IDs, capability manifest, run request, observer, result, status, session reference, and cancellation types.
- `runtime-registry.ts`: registration and lookup for Claude and Codex drivers, including capability summaries safe to expose to the renderer.
- `types.ts`: shared runtime-neutral event, result, status, and serialization types when those grow beyond the contract file.
- `runner.ts`: common `runAgentTask(request, observer, abortSignal)` entry point.
- `claude-adapter.ts`: adapter around existing Claude Code execution.
- `codex-adapter.ts`: adapter around existing Codex/ACP execution.
- `events.ts`: normalized event helpers and serialization.

The first implementation should extract narrow seams from the existing routers instead of moving all router code at once. The routers may remain as callers while the core stabilizes.

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

Each capability should have an explicit status such as `supported`, `unsupported`, or `degraded`, plus an optional reason. UI and CLI surfaces must use this manifest to decide which controls are visible, disabled, or warned about. They must not infer support from runtime name alone.

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

### CLI Output and Exit Codes
`text` output may render human-readable assistant and tool progress. `json` output returns a single final object with `job`, `status`, `result`, and `error` fields. `stream-json` writes one newline-delimited JSON object per job event and a final result object. In JSON modes, stdout is reserved for structured payloads and diagnostics go to stderr.

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

### Layer 5: Daemon, Schedule, Protocol
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

### SQLite as Source of Truth
Decision: persist jobs and events in the existing app SQLite database.

Why: Locus already uses local SQLite for projects, chats, sub-chats, provider config, and app agents. A second storage path would split local truth and make desktop/CLI consistency harder.

### Runtime Core Before CLI Behavior
Decision: extract a small runner core before making `resources/cli/locus` directly execute agent work.

Why: CLI should not duplicate Claude/Codex runtime logic or bypass settings, local-only guard behavior, provider profiles, MCP setup, or cancellation semantics.

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
- Daemon startup can introduce lifecycle bugs.
  - Mitigation: keep one-shot direct execution as Phase 1; add daemon only after durable jobs and CLI smoke pass.
- Job events can grow without bound.
  - Mitigation: store compact structured events, cap list queries, and add cleanup/export behavior in a later maintenance slice.
- Schedule can create surprising autonomous edits.
  - Mitigation: schedule is opt-in, local-only, visible, pausable, and defaults to plan/review-oriented modes unless the user explicitly selects agent mode.

## Phase Gates
- Phase 1 is complete when `locus run` can execute one task, stream output, return an exit code, and persist a job/event transcript.
- Phase 2 is complete when `locus jobs` can list/show/logs/cancel/retry persisted jobs and desktop can display CLI-created jobs.
- Phase 3 is complete when a local daemon can enqueue and run jobs without a renderer window while preserving crash/interrupted states.
- Phase 4 is complete when schedules can create visible local jobs with clear pause/delete controls.
- Phase 5 is complete when `locus acp` can serve a minimal ACP-compatible stdio session backed by the same runner core.
