# Tasks: Folderless quick chat and project-grouped sidebar

## 1. Data model and CRUD
- [x] 1.1 Make `chats.projectId` nullable in `src/main/lib/db/schema/index.ts` (drop `.notNull()`, keep FK + `onDelete: cascade`).
- [x] 1.2 Generate a Drizzle migration (`bun run db:generate`) and confirm existing rows are unaffected.
- [x] 1.3 Confirm `sub_chats.chatId` has `onDelete: cascade`; if not, add it or explicitly delete sub-chats before chat deletion.
- [x] 1.4 Make `chats.create`, `chats.get`, `chats.list`, and `chats.listArchived` accept/tolerate null `projectId` without fabricating a project.
- [ ] 1.5 Audit repo-only read paths (`getFileStats`, worktree/diff/terminal derivation, PR actions, workbench job queries, kanban, MCP/project lookup) and exclude or special-case null-project chats.

## 2. Runtime preflight and request contracts
- [x] 2.1 Change `DesktopRunPreflightResult` to a `kind: "project" | "folderless"` union with `project: null` only for folderless quick chats.
- [x] 2.2 Preserve existing project-backed cwd validation for `kind: "project"`.
- [x] 2.3 For `kind: "folderless"`, compute the app-managed scratch cwd in the main process and ignore/reject raw renderer cwd.
- [x] 2.4 Block folderless preflight when the chat has `worktreePath`, `branch`, PR metadata, archive state, mismatched sub-chat, or unsupported attachments.
- [x] 2.5 Update `DesktopRunContext` / desktop run request builders so project-backed runs carry `projectId: string` and folderless runs carry `projectId: null` or `workspaceKind: "folderless"` explicitly.
- [x] 2.6 Add tests proving project-backed preflight still rejects cwd mismatch and folderless preflight never starts from renderer-supplied cwd.

## 3. Assistant permission tier
- [ ] 3.1 Add an `assistant` control level in `src/main/lib/agent-runtime/permission-policy.ts` selected from folderless preflight, not from `AgentJobMode`.
- [ ] 3.2 Keep `AgentJobMode` and `sub_chats.mode` as `plan | agent`; do not persist `assistant` as a third mode.
- [ ] 3.3 Assistant policy allows only web-search/fetch equivalents and Locus-owned persistence; it denies file, shell, terminal, MCP/project, runtime/plugin mutation, and unknown tools.
- [ ] 3.4 Add targeted policy tests for assistant allow/deny categories and fail-closed unknown tools.

## 4. Claude and Codex enforcement
- [ ] 4.1 Claude: implement assistant allow-list enforcement in `src/main/lib/claude/agent-sdk-tool-permission.ts` before SDK query starts.
- [ ] 4.2 Codex ACP: implement assistant fail-closed permission mapping/handler for side-effecting or unknown tool requests before execution.
- [ ] 4.3 Codex app-server: implement assistant fail-closed approval gate for file, shell, MCP/project, runtime mutation, and unknown approval requests before execution.
- [ ] 4.4 Gate quick-chat provider/model choices to runtimes whose assistant enforcement is supported by capability truth.
- [ ] 4.5 Add tests for Claude assistant tool allow-list, Codex ACP assistant denial, and Codex app-server assistant denial when approval hooks are unavailable or classify a side effect.
- [ ] 4.6 Add or update runtime capability tests so the quick-chat assistant capability is not presented as runtime-neutral until Claude and Codex both report supported enforcement.

## 5. Folderless quick chat creation
- [ ] 5.1 In `new-chat-form.tsx`, render an assistant composer when no project is selected: hide `WorkModeSelector` and the plan/agent toggle, show a static "助手" affordance, keep supported provider/model selection + send.
- [ ] 5.2 Remove the hard `!projectForChat` send block for the folderless path; create with `projectId: null` and the selected supported provider metadata.
- [ ] 5.3 Make the empty/first-run state land on the quick-chat composer; remove the `validatedProject` early-return no-op in `openProjectPickerForNewWorkspace`.
- [ ] 5.4 Update active chat and input transports so folderless chats can stream without a project path while main-process preflight owns scratch cwd and assistant policy.
- [ ] 5.5 Update deferred repository onboarding so folderless quick-chat creation is available without a project while project-dependent repository workflows remain unavailable.

## 6. In-place upgrade (quick chat -> project)
- [ ] 6.1 Add `chats.attachProject({ chatId, projectId, useWorktree, baseBranch?, branchType?, targetMode })`.
- [ ] 6.2 Enforce attach preconditions: chat is null-project, unarchived, no active stream/job, no worktree/branch/PR metadata, target project exists, targetMode is `plan | agent`.
- [ ] 6.3 Optionally create the worktree using the same worktree owner as normal project chat creation.
- [ ] 6.4 After attach, subsequent turns use project-backed preflight, real cwd, and plan/agent permissions; the sidebar moves the chat into the project group.
- [ ] 6.5 Default to fresh runtime session after attach by clearing/ignoring folderless `sessionId`; only enable cross-cwd resume after dedicated end-to-end proof.
- [ ] 6.6 Add tests for failed attach during active stream, failed attach for non-quick chat, successful attach with fresh session, and history remaining visible.

## 7. Sidebar restructure
- [ ] 7.1 Add a `groupByProject(unpinnedAgents, projectsMap)` memo for project-backed chats (groups ordered by most-recent activity).
- [ ] 7.2 Render unpinned project-backed chats as collapsible project groups reusing `ChatListSection`/`ChatRow`; keep drafts and pinned flat at the top.
- [ ] 7.3 Add a top "快速对话" group for `projectId = null` chats.
- [ ] 7.4 Add `collapsedProjects` state persisted to `localStorage`; add a per-project "+" and a "项目" section header with "+ 打开仓库".
- [ ] 7.5 Add per-project "展开显示" beyond N rows.
- [ ] 7.6 Rebuild flat `filteredChats` to match visual order (quick chat -> pinned -> groups) so keyboard up/down navigation stays consistent.
- [ ] 7.7 Verify the layout works in mobile fullscreen.

## 8. Delete and archive
- [ ] 8.1 Wire `chats.delete` into the UI; for quick chats make delete the primary one-click action.
- [ ] 8.2 For code workspaces keep archive primary, delete behind a confirm dialog, with stronger confirmation when the worktree has uncommitted changes or an open PR.
- [ ] 8.3 Add "永久删除" per row and "清空归档" to `archive-popover.tsx`.

## 9. Uploads, output, and repo-surface exclusions
- [ ] 9.1 Confirm quick chat can read uploaded attachments and rewrite their content in its reply.
- [ ] 9.2 Add a save/download action for assistant output via a main-process save dialog chosen by the user.
- [ ] 9.3 Exclude `projectId = null` chats from workbench, kanban, terminal, diff, PR, worktree, and repo MCP surfaces; keep them in search.

## 10. Localization and verification
- [ ] 10.1 Add English and Simplified Chinese strings for quick chat, assistant mode, open repository, attach folder, permanent delete / clear, and confirm dialogs.
- [ ] 10.2 Run `openspec validate add-quick-chat-and-project-sidebar --strict --no-interactive`.
- [ ] 10.3 Run targeted tests for preflight, permission policy, Claude tool policy, Codex ACP/app-server denial, CRUD null project, attachProject, sidebar order, and repo-surface exclusions.
- [ ] 10.4 Run `bun run lint`, `bun run ts:check`, and targeted tests.
- [ ] 10.5 Manual smoke: create Claude quick chat -> verify web-only tools; create Codex ACP/app-server quick chat -> verify file/shell/MCP requests fail closed before execution; upload a file -> rewrite + download; attach a folder -> fresh project-backed session with full tools; sidebar groups by project with quick chat on top; delete a quick chat one-click; archive vs delete a code workspace.
