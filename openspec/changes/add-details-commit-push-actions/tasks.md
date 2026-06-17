# Tasks: Add Details commit and push actions (phase 3b)

> Baseline: `main` with Phase 3a/3c archived (`ec6b355`). Narrow UI/action slice.

## 1. Details commit action
- [ ] 1.1 Render the existing `CommitInput` inside `ChangesWidget` for selected local changes.
- [ ] 1.2 Reuse `useCommitActions` / `changes.atomicCommit` for selected paths; do not add another commit mutation path.
- [ ] 1.3 Refresh git status and diff data after commit using the existing parent refresh callback.

## 2. Details publish/push action
- [ ] 2.1 Show a distinct publish/push button when sync status reports no upstream or unpushed commits.
- [ ] 2.2 Reuse `usePushAction`; do not auto-push immediately after commit.
- [ ] 2.3 Keep pull/force-push/merge/rebase out of the compact widget and leave those to the expanded diff surface.

## 3. PR workflow boundary
- [ ] 3.1 Keep draft PR preparation and creation on the existing GitHub workflow confirmation path.
- [ ] 3.2 Ensure no GitHub mutation occurs without the existing confirmation dialog.

## 4. Verification
- [ ] 4.1 Extend targeted tests for Details commit/push entrypoints and no duplicate git implementation.
- [ ] 4.2 Run `openspec validate add-details-commit-push-actions --strict --no-interactive`.
- [ ] 4.3 Run targeted tests, `bun run lint`, `bun run ts:check`, and `bun run architecture:check`.
- [ ] 4.4 Manual smoke: Details Changes widget shows commit input for selected changed files, publish/push appears for sync status, and draft PR remains confirmed.
