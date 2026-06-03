# Tasks

## 0. Current Acceptance Boundary
- [x] 0.1 Record that phases 0-4 are implemented and smoked locally on macOS.
- [x] 0.2 Record that Windows shim implementation and source/unit tests exist, but real Windows smoke has not been run.
- [ ] 0.3 Run real Windows smoke for `locus run`, `locus jobs list`, `locus jobs logs`, and structured stdout/exit-code behavior.
- [x] 0.4 Record that ordinary desktop chat migration, daemon, schedule, and `locus acp` were kept out of the original first-slice implementation; Phase 5 and Phase 6 later moved desktop chat migration and the local daemon into explicit scope, while schedule and `locus acp` remain future work.

Current status is **macOS local implementation complete through Phase 6, pending Windows acceptance**. Do not describe this change as release-ready or archive-ready until item 0.3 passes or the OpenSpec scope is explicitly amended.

## 1. Proposal and Scope
- [x] 1.1 Create the OpenSpec proposal, design, and multiple capability deltas for headless agent jobs.
- [x] 1.2 Validate the OpenSpec change strictly.
- [x] 1.3 Clarify phase 0 boundaries for macOS/Windows CLI, GUI single-instance separation, cross-process cancellation, worker heartbeat/interruption, SQLite concurrency, stdout/stderr, and job/chat linking.
- [x] 1.4 Commit the proposal as its own planning slice.

## 2. Runtime Adapter Layer
- [x] 2.1 Add a narrow `AgentRuntime` run/observer/result contract for headless jobs.
- [x] 2.2 Register Claude Code and Codex adapters behind one `runAgentTask` entry point.
- [x] 2.3 Add capability gating before runtime work starts.
- [x] 2.4 Implement a Claude Code headless adapter using non-interactive print mode.
- [x] 2.5 Implement a Codex headless adapter using `codex exec`.
- [x] 2.6 Add focused tests for adapter arguments, process cancellation, auth failure classification, and stderr filtering.
- [x] 2.7 Wrap ordinary desktop chat streaming with linked `source=desktop` jobs while preserving the existing chat/sub-chat message, session, and stream behavior.

## 3. Durable Job Store
- [x] 3.1 Add Drizzle schema and migration for `agent_jobs`.
- [x] 3.2 Add Drizzle schema and migration for `agent_job_events`.
- [x] 3.3 Add worker lease fields for worker ID, worker PID, heartbeat, cancel requests, and stale-worker interruption.
- [x] 3.4 Implement job creation, status transitions, event append, event pagination, cancellation request, heartbeat, retry, and interrupted-job cleanup.
- [x] 3.5 Add tests for status transitions, append-only event ordering, cross-process cancel semantics, heartbeat interruption, and retry linkage.
- [x] 3.6 Ensure provider secrets are never stored in job rows or event payloads.

## 4. One-Shot CLI Runner
- [x] 4.1 Upgrade `resources/cli/locus` to support `open`, `run`, and `jobs` command dispatch on macOS without using `open -a` for headless commands.
- [x] 4.2 Upgrade `resources/cli/locus.cmd` with equivalent synchronous Windows command dispatch without detached `start` for headless commands.
- [x] 4.3 Add headless CLI argument handling in the Electron main process before BrowserWindow creation.
- [x] 4.4 Implement `locus run` by launching the Electron main process in headless CLI mode, not by duplicating runtime logic in a standalone Node script.
- [x] 4.5 Ensure headless CLI mode bypasses GUI single-instance focus/window behavior while preserving normal GUI single-instance behavior for `locus open`.
- [x] 4.6 Support `--cwd`, `--runtime`, `--mode`, `--prompt`, stdin, and output format options.
- [x] 4.7 Support `text`, `json`, and `stream-json` output formats with documented exit codes.
- [x] 4.8 Keep stdout JSON-only in structured modes and route diagnostics to stderr.
- [x] 4.9 Persist one-shot runs as local jobs without requiring chat/sub-chat creation.
- [x] 4.10 Add CLI parsing tests and macOS/Windows shim source tests.
- [x] 4.11 Run macOS fake and real headless smoke through Electron headless mode.
- [ ] 4.12 Run real Windows headless smoke on a Windows host or CI runner.

## 5. Job Management CLI
- [x] 5.1 Implement `locus jobs list` with text and JSON output.
- [x] 5.2 Implement `locus jobs show <job-id>`.
- [x] 5.3 Implement `locus jobs logs <job-id>` and `--follow`.
- [x] 5.4 Implement `locus jobs cancel <job-id>` for running and queued jobs.
- [x] 5.5 Implement `locus jobs retry <job-id>` for failed, canceled, and interrupted jobs.
- [x] 5.6 Add diagnostics for invalid cwd, unsupported runtime/mode, unavailable credentials, auth failure, and process failure.

## 6. Desktop Job Surface
- [x] 6.1 Add an `agentJobs` tRPC router for list, events/logs, cancel, and retry.
- [x] 6.2 Show active and recent CLI/headless jobs in the existing Agent Workbench.
- [x] 6.3 Add status filters, event/log detail, and linked chat/sub-chat navigation hooks.
- [x] 6.4 Show queued, running, succeeded, failed, canceled, and interrupted states for CLI/headless jobs.
- [x] 6.5 Reuse existing app surfaces for local file opening instead of adding parallel write paths.
- [x] 6.6 Keep renderer-visible job data sanitized and avoid exposing persisted input JSON.
- [x] 6.7 Show runtime/auth/process failures as job status and event data without claiming runtime parity.
- [x] 6.8 Keep ordinary desktop chat streaming on the existing chat/sub-chat path until a later explicit migration phase.
- [x] 6.9 Run a real desktop smoke where a CLI-created job appears in the app.
- [x] 6.10 Run real desktop chat migration smoke after `source=desktop` job migration is designed and implemented.

## 7. Verification
- [x] 7.1 Run `openspec validate add-headless-agent-jobs --strict --no-interactive`.
- [x] 7.2 Run focused Bun tests for runtime adapters, job store, CLI parsing/dispatch, process runner, shims, and desktop job UI.
- [x] 7.3 Run tests proving runtime capability declarations are consumed and unsupported/degraded behavior stays gated.
- [x] 7.4 Run `bun run ts:check`.
- [x] 7.5 Run `bun run build`.
- [x] 7.6 Smoke test macOS `locus run`, `locus jobs list`, and `locus jobs logs` via Electron headless mode.
- [x] 7.7 Smoke test desktop listing/log viewing for a CLI-created job and save screenshot/video evidence.
- [x] 7.8 Document deferred schedule, ACP, Codex parity, and Windows real-smoke evidence.
- [ ] 7.9 Run equivalent Windows smoke and attach evidence.

## 8. Phase 5: Desktop Chat as `source=desktop` Jobs
- [x] 8.1 Update OpenSpec design/spec boundaries for ordinary desktop chat job migration.
- [x] 8.2 Add a main-process desktop job lifecycle wrapper for existing Claude Code and Codex desktop chat streams.
- [x] 8.3 Create linked `source=desktop` jobs with project, chat, sub-chat, cwd, runtime, mode, and sanitized prompt preview.
- [x] 8.4 Mark desktop chat jobs running, succeeded, failed, canceled, or interrupted from the existing stream lifecycle.
- [x] 8.5 Route Workbench cancellation to the exact active desktop chat job without canceling a newer stream in the same sub-chat.
- [x] 8.6 Preserve existing `sub_chats.messages`, `session_id`, `stream_id`, attachments, guarded-run, rollback, tool approval, and provider-auth behavior.
- [x] 8.7 Show desktop chat jobs in Agent Workbench without labeling them as CLI jobs.
- [x] 8.8 Disable or redirect generic retry for `source=desktop` jobs until chat-safe retry semantics are implemented.
- [x] 8.9 Add focused tests for desktop job lifecycle, cancellation routing, UI source grouping, and desktop retry gating.
- [x] 8.10 Run real desktop smoke proving ordinary chat sends create linked `source=desktop` jobs and Workbench can navigate back to the chat.
- [x] 8.11 Save video/screenshot/smoke-summary artifacts for the Phase 5 desktop migration.

## 9. Phase 6: Local Daemon Queue
- [x] 9.1 Update OpenSpec proposal/design/spec to move the local daemon from future boundary into the explicit Phase 6 scope while keeping schedule and ACP deferred.
- [x] 9.2 Extract the one-shot job execution path into a reusable job runner used by both CLI and daemon workers.
- [x] 9.3 Add a local daemon loop that starts in headless Electron mode without a BrowserWindow, recovers stale running jobs on startup, respects a configurable concurrency limit, and claims only queued `source=daemon` jobs.
- [x] 9.4 Add daemon CLI parsing and dispatch for `locus daemon run`, `locus run --daemon`, and `locus run --daemon --follow`.
- [x] 9.5 Update macOS and Windows CLI shims so `daemon` uses the same synchronous headless Electron marker path as `run` and `jobs`.
- [x] 9.6 Keep default `locus run` as one-shot `source=cli`; do not route desktop chat, schedule, or protocol jobs through the daemon in this phase.
- [x] 9.7 Show daemon jobs in the desktop Agent Workbench and sidebar counts with source labels that distinguish daemon, CLI, and desktop jobs.
- [x] 9.8 Add focused tests for daemon queueing, concurrency, cancellation, startup stale-job interruption, CLI parsing/dispatch, shim dispatch, and desktop daemon job visibility.
- [x] 9.9 Run macOS real daemon smoke with a clean user data directory: start daemon, enqueue fake runner job, follow logs, verify terminal status, and prove no renderer window is required for daemon execution.
- [x] 9.10 Save daemon smoke screenshot/video/summary artifacts and update verification notes.
- [x] 9.11 Record that Windows daemon source/shim tests exist but real Windows daemon smoke remains pending until a Windows host or CI runner is used.

## 10. Phase 7: Local Schedules and Minimal ACP Stdio
- [x] 10.1 Update OpenSpec proposal/design/spec/tasks to move local schedules and minimal `locus acp` from future boundary into explicit Phase 7 scope.
- [ ] 10.2 Add local schedule persistence, migrations, and store helpers for create, list, update status, run-now, delete, next-run metadata, and audit linkage to created jobs.
- [ ] 10.3 Add schedule CLI parsing/dispatch for listing, creating, pausing, resuming, deleting, and running schedules now, with JSON-safe stdout and diagnostics on stderr.
- [ ] 10.4 Extend the local daemon loop to evaluate due enabled schedules, create at most one `source=schedule` job per due schedule fire, and claim queued schedule jobs without claiming desktop, one-shot CLI, or protocol jobs.
- [ ] 10.5 Add schedule tRPC APIs and Agent Workbench UI so schedules are visible, pausable/resumable, deletable, runnable now, and linked to their created jobs.
- [ ] 10.6 Add focused tests for schedule store transitions, CLI parsing/dispatch, daemon schedule firing/deduplication, job visibility, and UI labels/actions.
- [ ] 10.7 Add minimal `locus acp` stdio parsing/dispatch that supports initialization/capabilities, job-backed run creation, event streaming, cancellation, shutdown, strict JSON-RPC stdout, and stderr diagnostics.
- [ ] 10.8 Keep protocol jobs as `source=protocol`, route execution through the shared runner core, reject provider tokens/raw env over protocol, and avoid full ACP parity claims.
- [ ] 10.9 Update macOS and Windows CLI shims/source tests so `acp` and `schedules` use the synchronous headless Electron marker path.
- [ ] 10.10 Run comprehensive tests: OpenSpec strict validation, TypeScript, focused schedule/ACP/headless/job/UI/shim tests, build, and diff whitespace checks.
- [ ] 10.11 Run real macOS smoke with a clean user data directory: create a schedule, run it now, start daemon for due schedule, verify schedule-created jobs/logs, run minimal ACP stdio against a fake runner, verify protocol stdout is JSON-only, and save logs.
- [ ] 10.12 Record UI/UX evidence with screenshot/video for the schedule surface and protocol/schedule-created job visibility; fix any visible overlap, confusing labels, or action-state issues discovered during review.
- [ ] 10.13 Record that Windows schedule/ACP source and unit tests exist but real Windows schedule/ACP smoke remains pending until a Windows host or CI runner is used.

## Future Follow-Up Proposals
These items are intentionally not implementation tasks for this change:
- Full ACP parity beyond the minimal stdio job surface.
- Hosted or OS-level scheduling beyond the local daemon's opt-in schedule evaluation.
