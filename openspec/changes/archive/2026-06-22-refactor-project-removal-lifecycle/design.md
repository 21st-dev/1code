## Context
Projects currently own a local path and chats reference projects through
`chats.projectId`. The schema cascades project deletion into chats and sub-chats,
which is useful as a final database cleanup mechanism but unsafe as the primary
product action. The app also has existing worktree and process cleanup inside the
chat delete route, so project deletion can bypass resource cleanup.

The Local Job API already introduced a shared project registration owner, but the
desktop settings route still exposes a raw project delete path. This change
promotes project lifecycle into a canonical owner and separates "active project
registration" from "project history deletion."

## Goals
- Make the default user action non-destructive: removing a project from the active
  list preserves chat history.
- Provide an explicit destructive action for deleting removed project history,
  with a preview and truthful confirmation copy.
- Centralize project lifecycle behavior so desktop UI and headless project
  commands cannot drift.
- Preserve existing chats under their project identity after removal, so restore
  is simple and history does not become folderless or orphaned.
- Block project-dependent runtime/actions for removed projects until restore.

## Non-Goals
- Delete the user's repository directory or normal project files.
- Move removed project chats into folderless quick chats.
- Implement cloud sync, remote archive, or cross-device recovery.
- Allow project-history deletion while active desktop or headless jobs are still
  running for that project.

## Decisions
- Add a soft-removal state to `projects`, such as `removedAt`.
  - Active project lists query `removedAt IS NULL` by default.
  - Removed-project/history surfaces query `removedAt IS NOT NULL`.
  - Existing `chats.projectId` links stay intact.
- Re-registering the same canonical path restores the existing project row by
  clearing `removedAt` instead of creating a duplicate project.
- Keep SQLite cascade as the final hard-delete database mechanism, but never use
  a raw `db.delete(projects)` as the user-facing lifecycle operation.
- Add a shared lifecycle service, for example:
  - `getProjectRemovalPreview(db, projectId)`
  - `removeProjectFromList(db, projectId)`
  - `restoreProject(db, projectId | path)`
  - `getProjectHistoryDeletionPreview(db, projectId)`
  - `deleteProjectHistory(db, projectId)`
- Destructive history deletion runs resource cleanup before deleting the project
  row:
  - enumerate chats/sub-chats/worktree chats while the project row still exists
  - refuse queued/running jobs
  - kill workspace terminal/process sessions for affected worktree chats
  - remove Locus-created worktrees
  - invalidate git caches for deleted worktree paths
  - only then delete project/chats/sub-chats from SQLite
- Cleanup failure blocks the DB delete by default and returns a renderer-safe
  diagnostic with the affected project and worktree counts.
- The first implementation requires a two-step destructive flow: an active
  project cannot delete history directly. The user must remove it from the active
  Projects list first, then use Delete Project History from the removed-project
  history surface.
- The first implementation does not expose a Local Job API or CLI destructive
  `projects delete-history` command. Destructive project-history deletion is
  desktop UI only; headless project commands support non-destructive unregister
  and restore.

## User Experience
- Projects Settings danger zone exposes "Remove from Projects list" /
  "从项目列表移除" for active projects.
- Remove confirmation copy says the project will disappear from the active list
  while chat history and code files remain.
- The removed-project history surface exposes "Delete Project History" /
  "删除项目历史". Delete-history confirmation copy includes counts, for example:
  "This permanently deletes 12 chats and cleans 4 worktrees. Code files in your
  repository are not deleted. This cannot be undone."
- Removed projects appear in a history/recovery surface with actions to restore
  or permanently delete history.
- Opening a removed project chat shows historical messages and a restore
  affordance. Runtime send, terminal, worktree, diff, PR, and project MCP actions
  are disabled until restore.

## Risks / Trade-offs
- Keeping removed project rows means active queries must consistently filter by
  `removedAt`. Mitigation: centralize list helpers and add tests for active vs
  removed project queries.
- Users may expect "delete history" to delete repository files. Mitigation:
  confirmation copy explicitly distinguishes chats/worktrees from user code files.
- Cleanup can partially fail. Mitigation: perform cleanup before DB deletion and
  fail closed with a retryable diagnostic.
- Headless `unregister` semantics change from hard delete to soft removal.
  Mitigation: document in JSON output and keep destructive history deletion in
  the desktop UI for the first implementation.

## Migration Plan
1. Add `removedAt` to `projects` with a nullable default.
2. Change project list/status helpers to distinguish active and removed projects.
3. Update registration to restore removed projects for the same canonical path.
4. Replace raw project deletion in user-facing routes with lifecycle service
   calls.
5. Add removed-project history UI and destructive delete-history UI for removed
   projects.
6. Add tests for migration, active list filtering, restore, runtime blocking,
   worktree/process cleanup, and localized confirmation copy.

## Open Questions
- None for v1. Destructive project-history deletion is limited to removed
  projects and remains desktop UI only.
