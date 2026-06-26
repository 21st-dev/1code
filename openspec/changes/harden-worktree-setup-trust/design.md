## Context
The existing worktree path creates a Git worktree and then starts `executeWorktreeSetup` in the background. That function detects setup commands from repository files and executes each command through Node `exec`, which invokes a shell. Because the configuration is repository-controlled, the boundary must be explicit user trust rather than command sanitization.

## Goals / Non-Goals
- Goals: prevent automatic execution, show the exact command list before approval, remember approval for unchanged commands, and keep execution in the main process.
- Non-Goals: sanitizing arbitrary shell, replacing the setup command feature, solving unrelated tRPC filesystem boundaries, or migrating MCP credential storage.

## Decisions
- Decision: the canonical owner is `src/main/lib/git/worktree-setup-trust.ts`.
- Decision: approvals are keyed by project id and a SHA-256 fingerprint of config source, config path relative to the project, platform, and command list.
- Decision: a changed command list or changed config source/path produces a new fingerprint and requires approval again.
- Decision: skip does not persist approval; it only leaves the current worktree setup unrun.

## Risks / Trade-offs
- Users may need one extra click for legitimate setup commands. This is acceptable because the previous behavior crossed a local code-execution boundary without consent.
- The command runner still uses shell execution after approval. This preserves existing behavior while making the trust boundary explicit.

## Migration Plan
Existing setup configs remain readable but untrusted. The first worktree creation after this change shows the approval prompt instead of running setup automatically.
