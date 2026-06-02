# Tasks

## 0. Current Acceptance Boundary
- [x] 0.1 Record that phases 0-4 are implemented and smoked locally on macOS.
- [x] 0.2 Record that Windows shim implementation and source/unit tests exist, but real Windows smoke has not been run.
- [ ] 0.3 Run real Windows smoke for `locus run`, `locus jobs list`, `locus jobs logs`, and structured stdout/exit-code behavior.
- [x] 0.4 Keep ordinary desktop chat migration, daemon, schedule, and `locus acp` out of this first-slice implementation.

Current status is **local implementation complete, pending Windows acceptance**. Do not describe this change as release-ready or archive-ready until item 0.3 passes or the OpenSpec scope is explicitly amended.

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
- [ ] 2.7 Wrap ordinary desktop chat streaming with linked `source=desktop` jobs while preserving the existing chat/sub-chat message, session, and stream behavior.

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
- [ ] 6.10 Run real desktop chat migration smoke after `source=desktop` job migration is designed and implemented.

## 7. Verification
- [x] 7.1 Run `openspec validate add-headless-agent-jobs --strict --no-interactive`.
- [x] 7.2 Run focused Bun tests for runtime adapters, job store, CLI parsing/dispatch, process runner, shims, and desktop job UI.
- [x] 7.3 Run tests proving runtime capability declarations are consumed and unsupported/degraded behavior stays gated.
- [x] 7.4 Run `bun run ts:check`.
- [x] 7.5 Run `bun run build`.
- [x] 7.6 Smoke test macOS `locus run`, `locus jobs list`, and `locus jobs logs` via Electron headless mode.
- [x] 7.7 Smoke test desktop listing/log viewing for a CLI-created job and save screenshot/video evidence.
- [x] 7.8 Document deferred daemon, schedule, ACP, Codex parity, and Windows real-smoke evidence.
- [ ] 7.9 Run equivalent Windows smoke and attach evidence.

## 8. Phase 5: Desktop Chat as `source=desktop` Jobs
- [x] 8.1 Update OpenSpec design/spec boundaries for ordinary desktop chat job migration.
- [ ] 8.2 Add a main-process desktop job lifecycle wrapper for existing Claude Code and Codex desktop chat streams.
- [ ] 8.3 Create linked `source=desktop` jobs with project, chat, sub-chat, cwd, runtime, mode, and sanitized prompt preview.
- [ ] 8.4 Mark desktop chat jobs running, succeeded, failed, canceled, or interrupted from the existing stream lifecycle.
- [ ] 8.5 Route Workbench cancellation to the exact active desktop chat job without canceling a newer stream in the same sub-chat.
- [ ] 8.6 Preserve existing `sub_chats.messages`, `session_id`, `stream_id`, attachments, guarded-run, rollback, tool approval, and provider-auth behavior.
- [ ] 8.7 Show desktop chat jobs in Agent Workbench without labeling them as CLI jobs.
- [ ] 8.8 Disable or redirect generic retry for `source=desktop` jobs until chat-safe retry semantics are implemented.
- [ ] 8.9 Add focused tests for desktop job lifecycle, cancellation routing, UI source grouping, and desktop retry gating.
- [ ] 8.10 Run real desktop smoke proving chat still works and the same run appears as a linked `source=desktop` job.
- [ ] 8.11 Save video/screenshot/smoke-summary artifacts for the Phase 5 desktop migration.

## Future Follow-Up Proposals
These items are intentionally not implementation tasks for this change:
- Local daemon and recovery: enqueue, cancel, status, log-follow IPC, interrupted recovery, and bounded concurrency.
- Local scheduling: create, pause, resume, run-now, delete, and visible audit history for scheduled jobs.
- Protocol compatibility: `locus acp` stdio server backed by the same runner core with strict JSON-RPC stdout behavior.
