## Context
Locus is a local-first Electron app. The existing data model already has projects, chats, sub-chats, worktree paths, branch/base branch metadata, PR tracking fields, streamed session identifiers, local git status/diff APIs, and GitHub workflow helpers. The workbench should productize those existing surfaces before adding new durable workflow state.

## Goals / Non-Goals
- Goals:
  - Show a dense local overview of active coding-agent work.
  - Make review and continuation workflows reachable without hunting through chat tabs.
  - Reuse local SQLite, tRPC, git, diff, terminal, and GitHub workflow infrastructure.
  - Preserve explicit user confirmation before public GitHub writes.
- Non-goals:
  - Cloud task orchestration, remote execution, mobile handoff, and scheduler semantics.
  - Replacing chat/sub-chat as the source of truth for current work.

## Decisions

### Derived MVP State
Decision: derive the first workbench task model from existing `chats`, `sub_chats`, git status/diff, PR status, and renderer streaming status where possible.

Why: this avoids a premature `agent_runs` table and reduces migration risk. A later table can be justified only if derived state cannot represent real user workflows.

### Aggregate Router
Decision: add a dedicated `agentWorkbench` tRPC router that returns normalized task summaries and accepts no provider secrets.

Why: renderer components should not reimplement status classification across several routers. The router can centralize expensive git/GitHub checks and provide sanitized failure states.

### UI Placement
Decision: add a workbench surface inside the existing agents feature, with minimal wiring into the existing shell and without large edits inside `active-chat.tsx`.

Why: `active-chat.tsx` is already high-complexity. A separate `workbench/` feature folder keeps layout, cards, filters, and testable presentation helpers isolated.

### Status Classification
Decision: use a small finite status set for MVP: `running`, `blocked`, `needs-review`, `has-pr`, `clean`, and `archived`.

Why: users need an actionable queue, not an exhaustive runtime state machine. The router can include explanatory reasons for disabled or blocked actions.

### Local-Only Boundary
Decision: workbench may use local git and user-initiated GitHub workflows but must not reintroduce hosted upstream product calls.

Why: this keeps the change aligned with Locus local-only mode and existing GitHub confirmation boundaries.

## Risks / Mitigations
- Expensive git checks across many worktrees.
  - Mitigation: start with bounded counts and reuse existing git cache/status helpers; add throttling only if profiling shows a problem.
- Duplicating active chat actions.
  - Mitigation: call existing navigation, diff, and GitHub workflow primitives instead of creating new mutation paths.
- Ambiguous blocked state.
  - Mitigation: show concrete reasons from pending plan approval, pending user question, auth/runtime errors, or missing worktree.
- UI regression in dense agents layout.
  - Mitigation: isolate the workbench UI and verify with real Electron/browser click and visual checks.
