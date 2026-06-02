## 1. Proposal and boundaries
- [x] 1.1 Confirm the capability name, UX scope, and mutation boundaries.
- [x] 1.2 Confirm that the first implementation uses local `gh` authentication rather than Locus-managed GitHub tokens.
- [x] 1.3 Confirm that release publishing, artifact upload, auto-merge, and automatic review replies stay out of the first implementation.

## 2. Main-process GitHub context service
- [x] 2.1 Add a main-process helper that detects `gh --version`, `gh auth status`, repository remote, current branch, and default branch.
- [x] 2.2 Add typed wrappers for read-only `gh` commands with bounded timeouts and structured JSON parsing.
- [x] 2.3 Add error normalization for missing CLI, unauthenticated CLI, non-GitHub remotes, no current branch, no PR, and command failures.
- [x] 2.4 Add redaction and size limits for CI logs and review-comment context payloads.
- [x] 2.5 Add read-only current-branch pull request context shaping from `gh pr view` output.
- [x] 2.6 Add read-only issue/PR task import shaping from `gh issue view` and `gh pr view` output.
- [x] 2.7 Add bounded GitHub Actions failed-log shaping with secret-like redaction.

## 3. tRPC API surface
- [x] 3.1 Add a `githubWorkflow` router or equivalent procedures for status, current PR, issue import, PR import, checks, logs, and review comments.
- [x] 3.2 Add a typed create-draft-PR procedure that only accepts a user-confirmed request.
- [x] 3.3 Ensure all procedures run in the selected project/worktree cwd and reject ambiguous or missing repository context.
- [x] 3.4 Add the first `githubWorkflow` procedure for current pull request context by chat/worktree.
- [x] 3.5 Add a `githubWorkflow.importTaskFromUrl` procedure for GitHub issue/PR task import.
- [x] 3.6 Add a `githubWorkflow.getFailedCheckLog` procedure for current PR failed-check log handoff.

## 4. GitHub status UX
- [x] 4.1 Add a lightweight GitHub status card for GitHub repo detection, CLI availability, auth state, branch, and current PR summary.
- [x] 4.2 Add an unauthenticated path that opens a terminal with `gh auth login` rather than collecting credentials in Locus.
- [x] 4.3 Add empty/error states for non-GitHub repos, missing `gh`, no matching PR, and failed commands.

## 5. Agent-ready context handoff
- [x] 5.1 Add a GitHub context card format for PRs, issues, checks, logs, and review comments.
- [x] 5.2 Add "send to current agent" actions that attach bounded GitHub context to the active chat without changing the selected runtime.
- [x] 5.3 Ensure Claude Code, Codex, and provider-profile-backed runs receive the same normalized context text or attachment content.
- [x] 5.4 Add current pull request context handoff to the active sub-chat without changing runtime selection.

## 6. Issue and PR import
- [x] 6.1 Add a "Start from GitHub" URL input for GitHub issue and PR URLs.
- [x] 6.2 Parse and validate GitHub URLs before invoking `gh`.
- [x] 6.3 Render imported issue/PR task cards with title, number, state, labels, comments summary, and source URL.
- [x] 6.4 Let users send an imported issue/PR task to the current agent from the task card.

## 7. Draft PR creation
- [x] 7.1 Add a draft-PR preparation screen based on the current branch and local diff.
- [x] 7.2 Generate or prefill title/body/test-plan text without creating a PR automatically.
- [x] 7.3 Require user review and confirmation before running `gh pr create --draft`.
- [x] 7.4 Show the created PR URL and refresh current PR context after success.

## 8. Checks and review feedback
- [x] 8.1 Show checks summary for the current PR.
- [x] 8.2 Let users select a failing check and attach a bounded relevant log excerpt to the active agent chat.
- [x] 8.3 Show unresolved review comments grouped by file where available.
- [x] 8.4 Let users attach selected review comments to the active agent chat as a fix task.

## 9. Tests and verification
- [x] 9.1 Add unit tests for GitHub URL parsing and command argument construction.
- [x] 9.2 Add unit tests for `gh` JSON parsing and normalized error states.
- [x] 9.3 Add tests for log truncation/redaction and context block formatting.
- [x] 9.4 Add renderer tests or targeted component tests for status, current PR, import, and confirmation states where feasible.
- [x] 9.5 Add a local smoke checklist for missing `gh`, unauthenticated `gh`, non-GitHub repo, repo with current PR, and repo without current PR.
- [x] 9.6 Add unit coverage for current PR check summaries and runtime-agnostic context text formatting.
- [x] 9.7 Add unit coverage for GitHub task URL parsing and task context text formatting.
- [x] 9.8 Add unit coverage for GitHub CLI empty/error state normalization.
