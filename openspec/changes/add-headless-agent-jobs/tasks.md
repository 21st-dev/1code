# Tasks

## 1. Proposal and Scope
- [x] 1.1 Create the OpenSpec proposal, design, and multiple capability deltas for headless agent jobs.
- [x] 1.2 Validate the OpenSpec change strictly.
- [ ] 1.3 Commit the proposal as its own planning slice.

## 2. Runtime Core Extraction
- [ ] 2.1 Add `src/main/lib/agent-runtime/contract.ts` with `AgentRuntime`, runtime IDs, capability statuses, run request/result/session types, and observer/cancellation contracts.
- [ ] 2.2 Add `src/main/lib/agent-runtime/runtime-registry.ts` to register Claude and Codex drivers and expose non-secret capability summaries to main-process callers and renderer-facing routers.
- [ ] 2.3 Add normalized event helpers for assistant output, reasoning, tool calls, status updates, permission requests, scope expansion, AskUserQuestion, errors, and completion.
- [ ] 2.4 Extract a narrow Claude adapter from the existing Claude router without changing renderer behavior, including an honest capability manifest for the behaviors the adapter actually enforces.
- [ ] 2.5 Extract a narrow Codex adapter from the existing Codex router without changing renderer behavior, including the same capability names as Claude but allowing `degraded` or `unsupported` states when behavior parity is not yet implemented.
- [ ] 2.6 Add focused tests for runtime registry lookup, capability manifests, event normalization, adapter cancellation behavior, and declared-capability enforcement.
- [ ] 2.7 Keep existing `claude` and `codex` tRPC subscriptions working while migrated behavior routes through the new core where practical.

## 3. Durable Job Store
- [ ] 3.1 Add Drizzle schema and migration for `agent_jobs`.
- [ ] 3.2 Add Drizzle schema and migration for `agent_job_events`.
- [ ] 3.3 Implement job creation, status transitions, event append, event pagination, and interrupted-job cleanup.
- [ ] 3.4 Add tests for status transitions and append-only event ordering.
- [ ] 3.5 Ensure provider secrets are never stored in job rows or event payloads.

## 4. One-Shot CLI Runner
- [ ] 4.1 Upgrade `resources/cli/locus` to support `open`, `run`, and `jobs` command dispatch on macOS/Linux.
- [ ] 4.2 Upgrade `resources/cli/locus.cmd` with equivalent Windows command dispatch or a documented first-slice limitation.
- [ ] 4.3 Add headless CLI argument handling in the Electron main process before BrowserWindow creation.
- [ ] 4.4 Implement `locus run` by launching the Electron main process in headless CLI mode, not by duplicating runtime logic in a standalone Node script.
- [ ] 4.5 Support `--cwd`, `--runtime`, `--mode`, `--prompt`, stdin, and output format options.
- [ ] 4.6 Support `text`, `json`, and `stream-json` output formats with documented exit codes.
- [ ] 4.7 Persist one-shot runs as local jobs linked to project/chat/sub-chat where possible.
- [ ] 4.8 Add CLI parsing tests and local smoke commands.

## 5. Job Management CLI
- [ ] 5.1 Implement `locus jobs list` with text and JSON output.
- [ ] 5.2 Implement `locus jobs show <job-id>`.
- [ ] 5.3 Implement `locus jobs logs <job-id>` and `--follow`.
- [ ] 5.4 Implement `locus jobs cancel <job-id>` for running jobs.
- [ ] 5.5 Implement `locus jobs retry <job-id>` for failed, canceled, and interrupted jobs.
- [ ] 5.6 Add diagnostics for missing app database, invalid cwd, unsupported runtime, and unavailable credentials.

## 6. Desktop Job Surface
- [ ] 6.1 Add a `jobs` tRPC router for list, detail, events, cancel, and retry.
- [ ] 6.2 Show active and recent jobs in the existing agents/workbench area.
- [ ] 6.3 Add status filters, event/log detail, and linked chat/sub-chat navigation.
- [ ] 6.4 Show reconnect/interrupted states for jobs created by CLI or daemon.
- [ ] 6.5 Reuse existing GitHub confirmation and diff/review surfaces instead of adding parallel write paths.
- [ ] 6.6 Gate runtime-specific UI controls from the `AgentRuntime` capability manifest instead of provider-name checks where capability behavior matters.
- [ ] 6.7 Show degraded/unsupported runtime capabilities clearly and link Codex parity gaps to the separate `upgrade-codex-runtime-parity` change instead of hiding them behind provider-specific branches.
- [ ] 6.8 Run a real desktop smoke where a CLI-created job appears in the app.
- [ ] 6.9 Run real desktop chat smoke verifying supported runtime behavior still works and unsupported/degraded runtime capabilities are visible instead of falsely enabled.

## 7. Verification
- [ ] 7.1 Run `openspec validate add-headless-agent-jobs --strict --no-interactive`.
- [ ] 7.2 Run focused Bun tests for runtime core, job store, and CLI parsing.
- [ ] 7.3 Run focused tests proving runtime capability declarations are enforced and caller gating handles degraded/unsupported states.
- [ ] 7.4 Run `bun run ts:check`.
- [ ] 7.5 Run `bun run build`.
- [ ] 7.6 Smoke test `locus run`, `locus jobs list`, `locus jobs logs`, and cancellation.
- [ ] 7.7 Smoke test desktop reconnect/listing for CLI-created jobs.
- [ ] 7.8 Document unsupported first-slice surfaces clearly if Windows CLI parity, daemon, schedule, ACP surfaces, or Codex parity capabilities are deferred.

## Future Follow-Up Proposals
These items are intentionally not implementation tasks for this change:
- Local daemon and recovery: enqueue, cancel, status, log-follow IPC, interrupted recovery, and bounded concurrency.
- Local scheduling: create, pause, resume, run-now, delete, and visible audit history for scheduled jobs.
- Protocol compatibility: `locus acp` stdio server backed by the same runner core with strict JSON-RPC stdout behavior.
