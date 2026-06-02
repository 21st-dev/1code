# Change: Add agent scope contracts and guarded runs

## Why
Locus already lets users run Claude Code and Codex against local projects, but Agent mode still relies mostly on model behavior and post-hoc diff review to keep work bounded. Users need a first-class local contract that defines what an agent may change, what evidence it may use, and how completion should be verified before a run starts.

This change turns structured planning into enforceable execution boundaries. It borrows the useful ideas from scope-contract, diff-review, Plan/Act, git-aware, and linear-run-trace agent projects, but implements them as Locus-owned local workflow state rather than adding another coding-agent runtime.

## What Changes
- Add a new `agent-scope-contracts` capability for guarded local agent runs.
- Add a user-confirmed scope contract model with editable files, read-only evidence, success checks, run mode, and expansion history.
- Add a Guarded Run entry point that can start from manual input, selected files, GitHub context, changed files, or a Plan-mode summary.
- Add main-process validation for scope contracts before any runtime is invoked.
- Add Claude Code hard enforcement through the existing `canUseTool` hook for file writes, edits, and risky shell commands.
- Add scope-expansion approval when a runtime asks to write outside the approved boundary.
- Add Codex contract delivery and post-run audit in the first phase, while explicitly deferring hard Codex tool enforcement until the ACP provider exposes a pre-execution permission hook.
- Add a pending-changes review summary and optional checkpoint/rollback behavior for guarded runs.
- Add structured run audit metadata so the user can see respected scope, expansions, blocked attempts, changed files, verification results, and drift.

## Impact
- Affected specs: `agent-scope-contracts` (new)
- Related specs: `app-agents`, `runtime-plugins`, `local-only-cloud-guard`, `agent-context-recommendations`, `agent-workbench`
- Affected code:
  - `src/renderer/features/agents/` guarded-run UI, input state, transport payloads, tool/result rendering
  - `src/renderer/features/agents/lib/ipc-chat-transport.ts`
  - `src/renderer/features/agents/lib/acp-chat-transport.ts`
  - `src/main/lib/agent-guard/` new shared guard implementation
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/main/lib/git/security/` path validation reuse
  - `src/main/lib/db/schema/` only if message metadata proves insufficient for durable audit lookup
  - `tests/` targeted unit and router tests for contract validation, guard decisions, audit summaries, and transport payloads

## External Inspirations, Not Dependencies
- Kevix-style positive scope contracts and deterministic gates.
- Plandex-style pending diff review before applying or trusting broad changes.
- Cline-style Plan-to-Act workflow and checkpoint thinking.
- Aider-style git-aware context, changed-file visibility, and verification loops.
- mini-SWE-agent-style linear run traces that are easy to inspect.

The implementation SHALL NOT add these projects as runtime dependencies for the initial capability.
