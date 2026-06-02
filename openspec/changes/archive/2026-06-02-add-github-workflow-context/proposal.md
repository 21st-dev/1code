# Change: Add GitHub Workflow Context

## Why
Locus is a multi-runtime desktop coding agent platform, but GitHub workflow context is currently fragmented across each runtime's private capabilities or terminal output. Users should be able to load GitHub issues, pull requests, checks, logs, and review feedback once, then hand that same structured context to Claude Code, Codex, or a configured third-party provider.

## What Changes
- Add a runtime-agnostic GitHub workflow context capability for user-opened local GitHub repositories.
- Detect GitHub CLI availability, authentication, repository remote, branch, and current pull request state without storing GitHub credentials in Locus.
- Provide read-only pull request, issue, checks, CI log, and review-comment context that can be attached to the active agent conversation.
- Add a user-confirmed draft pull request creation flow after the read-only context path is in place.
- Keep GitHub mutations explicit and reviewable; do not auto-comment, auto-resolve review threads, auto-merge, or auto-publish releases in this change.

## Impact
- Affected specs: `github-workflow-context`
- Affected code:
  - `src/main/lib/trpc/routers/` for a GitHub context API surface
  - `src/main/lib/git/` or a new `src/main/lib/github-workflow/` helper for `gh` command execution and parsing
  - `src/renderer/features/agents/` for agent-context injection from GitHub tasks
  - `src/renderer/` project/worktree Git UI surfaces for GitHub status, PR context, issue/PR import, checks, and review feedback
  - Tests for `gh` output parsing, command construction, context shaping, and mutation gating
