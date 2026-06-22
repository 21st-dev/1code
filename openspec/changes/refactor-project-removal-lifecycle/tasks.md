## 1. Immediate safety baseline
- [x] 1.1 Replace the current Settings project delete copy with truthful count-based destructive copy until the lifecycle split lands.
- [x] 1.2 Add project deletion preview plumbing for chat/sub-chat/worktree counts.
- [x] 1.3 Extract shared chat/workspace cleanup logic from `chats.delete` so project-history deletion can reuse it.
- [x] 1.4 Make current hard project deletion run worktree/process cleanup before DB deletion and fail closed on cleanup failure.
- [x] 1.5 Invalidate projects/chats queries after any project lifecycle mutation.

## 2. Project lifecycle owner and data model
- [ ] 2.1 Add a nullable removed-state column to `projects` (for example `removedAt`) and migration coverage.
- [ ] 2.2 Add a shared project lifecycle service under `src/main/lib/projects/` for preview, remove-from-list, restore, and delete-history actions.
- [ ] 2.3 Update project registration to restore removed projects for the same canonical path instead of inserting duplicates.
- [ ] 2.4 Update active project list/get helpers to exclude removed projects by default and expose explicit removed-project queries.
- [ ] 2.5 Update `projectsRouter` and Local Job API project unregister to use the lifecycle owner.
- [ ] 2.6 Ensure Local Job API exposes only non-destructive project unregister/restore behavior in this change, with no `projects delete-history` command.
- [ ] 2.7 Add architecture/behavior tests preventing user-facing routes from raw-deleting `projects` without the lifecycle owner.

## 3. Product UI split
- [ ] 3.1 Change active Projects Settings danger zone to expose only the non-destructive "Remove from Projects list" action.
- [ ] 3.2 Add preview/confirmation dialogs for both actions with distinct copy and counts.
- [ ] 3.3 Add a removed-project history/recovery surface with restore and delete-history actions; Delete Project History is available only from this removed-project surface.
- [ ] 3.4 Add restore flows from removed project history and re-open-same-path registration.
- [ ] 3.5 Disable runtime send, terminal, worktree, diff, PR, and project MCP actions for removed project chats until restore.
- [ ] 3.6 Add English and Simplified Chinese dictionary entries for all new labels, descriptions, blockers, and confirmations.

## 4. Verification
- [ ] 4.1 Add database tests proving removing a project preserves chats/sub-chats and restore reuses the same project row.
- [ ] 4.2 Add deletion tests proving delete-history is blocked for active projects and removes removed-project chats/sub-chats only after worktree/process cleanup succeeds.
- [ ] 4.3 Add active-job tests proving remove/delete-history refuse or report queued/running jobs according to the lifecycle contract.
- [ ] 4.4 Add runtime preflight tests proving removed project chats are viewable but cannot start project-backed runs.
- [ ] 4.5 Add renderer/unit tests for removed-project UI grouping, restore affordance, delete-history copy, and cache invalidation.
- [ ] 4.6 Run `openspec validate refactor-project-removal-lifecycle --strict --no-interactive`.
- [ ] 4.7 Run targeted `bun test` coverage for project lifecycle, chat cleanup, Local Job API project unregister, and runtime preflight.
