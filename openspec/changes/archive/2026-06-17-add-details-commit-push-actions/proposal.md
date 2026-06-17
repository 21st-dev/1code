# Change: Promote Details commit and push actions

## Why
Phase 3a made the Details sidebar the primary environment inspector, but the Changes widget still treats commit/push as a compact callback button rather than a first-class workflow. Users should be able to commit selected files, publish or push the current branch, and continue into the existing PR draft flow from the Details Changes widget without expanding to the full diff surface.

## What Changes
- Add first-class commit controls inside the Details Changes widget by reusing the existing `CommitInput` / `useCommitActions` path.
- Add an explicit publish/push action for existing unpushed commits by reusing `usePushAction` and existing sync-status counts.
- Keep draft PR creation on the existing GitHub workflow preparation and confirmation path.
- Do not add a new git, GitHub token, or backend write-back implementation.

## Impact
- Affected specs: `agent-workbench`
- Affected code: `src/renderer/features/details-sidebar/sections/changes-widget.tsx`, `src/renderer/features/changes/components/commit-input/commit-input.tsx`, existing Details/sidebar wiring tests
