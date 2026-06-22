# Change: Refactor project removal lifecycle

## Why
The current Projects settings "Remove Project" action looks like a harmless
delisting operation, but it hard-deletes the project row and lets SQLite cascade
delete all chats and sub-chats for that project. It also bypasses the normal chat
delete cleanup path, so worktrees and running workspace processes can be left
behind.

The product needs a clear lifecycle: removing a project from the active list must
be different from permanently deleting Locus history for that project.

## What Changes
- Add a canonical project lifecycle owner for project registration visibility,
  removal preview, restore, and destructive project-history deletion.
- Split the product semantics into two actions:
  - Remove from Projects list: hide/deactivate the project registration while
    preserving chats, sub-chats, worktrees, and code files.
  - Delete Project History: after a project has been removed from the active list,
    permanently delete its chats/sub-chats and clean Locus-owned
    worktrees/processes after an explicit count-based confirmation.
- Require the safe two-step v1 flow for destructive project-history deletion:
  active projects must be removed from the Projects list before their history can
  be deleted.
- Add a `projects.removedAt`-style active/removed state so removed projects can
  be restored without orphaning chat history.
- Make project registration idempotently restore a removed project for the same
  canonical path.
- Add a removed-project history/recovery surface where users can inspect removed
  project chats, restore the project, or explicitly delete its Locus history.
- Keep removed project chats viewable but block project-dependent runtime,
  worktree, diff, terminal, PR, and project MCP workflows until the project is
  restored.
- Align the desktop projects router and Local Job API project unregister command
  on the same shared lifecycle owner.
- Keep destructive project-history deletion desktop-only in the first
  implementation; Local Job API commands support non-destructive unregister and
  restore but do not expose `projects delete-history`.
- Localize all new destructive and non-destructive project lifecycle copy in
  English and Simplified Chinese.

## Impact
- Affected specs:
  - `project-lifecycle`
  - `local-job-api`
  - `workspace-navigation`
  - `ui-localization`
  - `agent-runtime-core`
- Affected code:
  - `src/main/lib/db/schema/`
  - `src/main/lib/projects/registry.ts`
  - new shared lifecycle service under `src/main/lib/projects/`
  - `src/main/lib/trpc/routers/projects.ts`
  - Local Job API project commands under `src/main/lib/headless/`
  - runtime preflight under `src/main/lib/agent-runtime/`
  - Settings Projects tab and archive/history navigation surfaces in
    `src/renderer/`
  - project/chats/worktree cleanup tests under `tests/`
