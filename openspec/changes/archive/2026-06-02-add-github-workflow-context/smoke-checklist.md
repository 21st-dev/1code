# Local Smoke Checklist: GitHub Workflow Context

Use this checklist after changing the GitHub workflow context surfaces. These checks are intentionally manual because the behavior depends on the user's local `gh` install, auth state, and repository remotes.

## Status And Empty States

- Missing `gh`: launch Locus with `gh` absent from PATH. Expected: Info shows `GitHub CLI not found` with install/PATH guidance and no PR/task import action silently fails.
- Unauthenticated `gh`: use a `gh` config state where `gh auth status` fails. Expected: Info and imported task failures show `GitHub CLI not authenticated` and offer `Run gh auth login`, opening a terminal in the workspace.
- Non-GitHub repository: open a Git repo whose `origin` is not GitHub. Expected: Info shows `Not a GitHub repository`; task import still accepts a full GitHub issue/PR URL.
- No current PR: open a GitHub repo branch with no matching PR. Expected: Info shows `No PR for current branch`; no failed-check/review-comment actions are rendered.
- Invalid task URL: paste a non-issue/non-PR URL into `Start from GitHub`. Expected: inline error explains the accepted GitHub issue/PR URL formats.

## Current PR Context

- Current PR exists: open a branch with an existing PR. Expected: PR card shows PR number, status, checks summary, review status, `Send PR context`, and `Open in browser`.
- Passing or pending checks only: open a PR without failed checks. Expected: PR card says there are no failed checks to send.
- Failed check exists: open a PR with at least one failed GitHub Actions check. Expected: failed check row shows `Send log`; clicking it sends a bounded, redacted failed-log context block to the current active agent chat.
- Unresolved review comments exist: open a PR with review threads. Expected: review comments are grouped by file and `Send comments` sends a bounded fix task to the current active agent chat.
- No unresolved review comments: open a PR with zero unresolved threads. Expected: review area says no unresolved review comments and does not render a send action.

## Draft PR Creation

- Default/base branch: open `main`/default branch. Expected: Draft PR is disabled or returns a clear feature-branch message.
- Dirty worktree: prepare a draft on a feature branch, then leave uncommitted changes before create. Expected: create is blocked with a commit/stash message; `gh pr create` is not run.
- Branch changed after prepare: prepare on one feature branch, switch branches, then create. Expected: create is blocked and asks the user to refresh the draft.
- No committed branch changes: use a clean feature branch with no commits ahead of base. Expected: create is blocked with a no-committed-changes message.
- Existing PR: run Draft PR on a branch that already has a PR. Expected: Locus links or shows the existing PR instead of creating a duplicate.
- Successful draft PR: use a clean feature branch with committed changes. Expected: user can edit title/body/test plan, confirm explicitly, Locus pushes the branch if needed, runs `gh pr create --draft`, shows the created URL, and refreshes current PR context.
