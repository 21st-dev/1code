## Context
The full Changes surface already owns commit input behavior through `CommitInput` and `useCommitActions`, and the diff header already owns branch publish/push behavior through `usePushAction` plus sync-status counts. The Details Changes widget currently has file selection and draft PR preparation, but its commit action is a compact parent callback that hides the commit message path and conditionally conflates commit with push.

## Goals / Non-Goals
- Goals: make commit, publish, and push visible in the Details Changes widget; preserve selected-file commit behavior; reuse existing mutations and cache refresh paths; keep PR draft creation confirmed.
- Non-Goals: implement force-push, pull, merge/rebase, reviewer write-back, or a new GitHub write-back surface in the compact widget.

## Decisions
- Decision: render `CommitInput` in the Details Changes widget when local changes exist.
  - Rationale: this reuses the existing AI-generated commit-message path and atomic selected-file commit behavior instead of adding a second commit implementation.
- Decision: render a separate publish/push button only for unpushed committed work (`publish` or `push` sync states), not as an automatic follow-up to commit.
  - Rationale: push is a remote write and should remain an explicit user action. This avoids hiding network writes behind a commit button.
- Decision: keep draft PR creation in the existing widget path that calls `githubWorkflow.prepareDraftPullRequest` and `createDraftPullRequest` with confirmation.
  - Rationale: that path already enforces the GitHub workflow boundary and refreshes PR context after creation.

## Risks / Trade-offs
- The compact Details widget becomes taller when changes exist. Mitigation: keep the file list capped and reuse the existing compact commit input styling.
- Publish/push does not expose every advanced diff-header sync action. Mitigation: the full diff surface still owns pull, force-push, merge/rebase, and broader git operations.
