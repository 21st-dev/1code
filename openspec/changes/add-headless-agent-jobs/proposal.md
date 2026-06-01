# Change: Add headless agent jobs

## Why
Locus already has local chats, worktrees, Claude/Codex runtime integrations, terminal support, and a local Agent Workbench, but execution is still primarily tied to the interactive desktop surface. Users need a local-first way to start, monitor, cancel, and resume coding-agent work from both the desktop app and command line without introducing a hosted queue or a second agent runtime stack.

This change defines the first implementable slice of headless execution as a local agent job system: a shared main-process runtime core, durable SQLite job/event state, a CLI front door, desktop job visibility, and protocol-shaped events. Local daemon, schedule, and ACP-compatible surfaces are documented as follow-up proposals, not implementation requirements for this change.

## What Changes
- Add a runtime-neutral agent runner core that normalizes Claude and Codex execution requests, stream events, cancellation, completion, and error states.
- Define an explicit `AgentRuntime` contract and runtime capability manifest so Claude and Codex drivers declare support, degraded, or unsupported states for runtime behavior without exposing provider secrets.
- Gate desktop and CLI behavior from runtime capabilities instead of hard-coding Claude as the full-featured path or treating Codex as a hidden fallback.
- Register Codex through the same runtime contract with honest capabilities, while leaving the work to make Codex behavior-equivalent to Claude Code to the separate `upgrade-codex-runtime-parity` change.
- Add durable local job and event records for one-shot, queued, running, completed, failed, canceled, and interrupted agent work.
- Upgrade the packaged `locus` CLI from an app launcher into a local headless front door with `run` and `jobs` commands.
- Add desktop job visibility and reconnect behavior so CLI-created work can be inspected from the app and app-created work can be inspected from the CLI.
- Define phase gates for local daemon, retry/recovery, schedule, and ACP-compatible protocol surfaces as future work without making them part of this implementation checklist.
- Preserve local-first behavior: no hosted upstream queue, no hidden cloud automation, no renderer-owned provider secrets, and no plaintext secrets in CLI arguments.

## Impact
- Affected specs:
  - `agent-runtime-core` (new)
  - `headless-agent-jobs` (new)
  - `desktop-agent-jobs` (new)
  - `agent-protocol-interfaces` (new)
- Affected code:
  - `src/main/lib/agent-runtime/**`
  - `src/main/lib/agent-runtime/contract.ts`
  - `src/main/lib/agent-runtime/runtime-registry.ts`
  - `src/main/lib/headless/**`
  - `src/main/lib/db/schema/index.ts`
  - `src/main/lib/trpc/routers/jobs.ts`
  - `src/main/lib/trpc/routers/index.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/renderer/features/agents/**`
  - `resources/cli/locus`
  - `resources/cli/locus.cmd`
  - packaging/build resources for the CLI entry point
- Validation:
  - `openspec validate add-headless-agent-jobs --strict --no-interactive`
  - focused tests for runner event normalization, runtime capability gating, job persistence, and CLI argument parsing
  - `bun run ts:check`
  - `bun run build`
  - local CLI smoke for `locus run` and `locus jobs`
  - real desktop smoke verifying CLI-created jobs appear in the app
  - real desktop chat smoke verifying supported runtime paths still work and unsupported/degraded capabilities are surfaced honestly
  - explicit documentation for deferred daemon, schedule, Windows CLI limitations, or ACP surfaces when not implemented in this slice

## Non-Goals
- Do not implement hosted cloud agents, remote sandboxes, multi-device sync, or subscription-backed background execution.
- Do not make a full scheduler, ACP server, or daemon part of this change.
- Do not bypass existing local-only guards, provider profile rules, GitHub confirmation flows, or credential storage boundaries.
- Do not copy Codex, Claude Code, Goose, OpenHands, or ACP wholesale; use them only as reference architecture and interface patterns.
- Do not replace the existing chat/sub-chat product model. Jobs should link back to local projects, chats, sub-chats, and worktrees.
- Do not claim Codex has Claude Code behavior parity in this change. A runtime feature is available only when the registered driver capability says it is available and the adapter enforces the stated behavior.
- Do not block this headless jobs slice on Codex feature parity. Missing Codex capabilities must be visible as `degraded` or `unsupported` and handled by caller gating; behavior parity is owned by `upgrade-codex-runtime-parity`.
