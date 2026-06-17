# Design: Folderless quick chat and project-grouped sidebar

This change has two coupled parts: a runtime/data capability (folderless quick chat) and a renderer restructure (project-grouped sidebar). The sidebar's quick-chat group is meaningless without the folderless capability, so they ship together.

## Context

- A chat in Locus is a workspace: a row in `chats` with an optional git worktree (`worktreePath`, `branch`). Sub-chats are conversation tabs that share the workspace context.
- `chats.projectId` is currently `NOT NULL` with `onDelete: cascade` (`src/main/lib/db/schema/index.ts:37`). Every existing chat has a project.
- Desktop runtime startup already has canonical owners: `src/main/lib/agent-runtime/preflight.ts`, `src/main/lib/agent-runtime/permission-policy.ts`, and `src/main/lib/agent-runtime/desktop-run-request.ts`. Folderless quick chat must extend those owners; routes and transports must not bypass them with route-local scratch-cwd logic.
- Current desktop chat modes are `plan | agent` in shared job/runtime types. This change does not make `assistant` a third persisted `AgentJobMode`; `assistant` is a permission/control level derived from a folderless preflight result.
- Claude and Codex use different adapter surfaces. Full scope requires Claude SDK, Codex ACP, and Codex app-server to enforce the assistant tier before side effects execute, or to fail closed before provider/tool work starts.
- Uploads are in-context message attachments (text concatenated, images base64 or local refs), not project files on disk (`src/renderer/features/agents/lib/acp-chat-transport.ts:441`).

## Goals / Non-Goals

- Goals: folderless assistant chats for Claude and Codex; fail-closed pre-tool assistant permission enforcement; a project-grouped sidebar that preserves existing row affordances; in-place upgrade; type-aware delete; assistant output download.
- Non-goals: scoped sandbox tier (3-B); workbench/kanban redesign; global terminology rename; provider credential or transport-auth changes.

## Decisions

### 1. Data model: nullable project, explicit workspace kind
- Make `chats.projectId` nullable (drop `.notNull()`), keep the FK with `onDelete: cascade`. Add a Drizzle migration. A quick chat has `projectId = null`.
- Do not infer `assistant` from `sub_chats.mode`. The workspace kind is derived from `chat.projectId === null`; the persisted sub-chat mode remains `plan | agent` for compatibility.
- Audit every read path that assumes a non-null project and exclude or special-case null: `chats.get`, `chats.list`/`listArchived`, `getFileStats`, worktree/diff/terminal derivation, workbench job queries, kanban, PR actions, and project MCP lookup. Null-project chats must never be handed to worktree, diff, terminal, PR, or job workspace code.

### 2. Desktop preflight: project-backed and folderless branches
- Change `DesktopRunPreflightResult` into an explicit union:
  - `kind: "project"` with `project: Project`, existing `cwd = chat.worktreePath || project.path`, and the existing registered-project/cwd mismatch checks.
  - `kind: "folderless"` with `project: null`, `cwd` set by main process to an app-managed scratch directory, and no trust in renderer-supplied cwd.
- Folderless preflight must still verify chat/sub-chat ownership, runtime, provider profile metadata, attachment readiness, local-only constraints, and that the chat has no `projectId`, `worktreePath`, `branch`, `prUrl`, or `prNumber`.
- Folderless preflight marks project MCP, project context, worktree setup, diff, terminal, PR, guarded-scope contract, and kanban/workbench task derivation as skipped or unavailable before provider startup.

### 3. Assistant permission tier: control level, not mode
- Add an `assistant` desktop control level in `permission-policy.ts` that is selected only from `preflight.kind === "folderless"`. It is not accepted as an ordinary route mode and is not written to `sub_chats.mode`.
- Assistant policy:
  - allow web information tools only (`WebSearch`, `WebFetch`, and equivalent Codex web-search/fetch tools when the adapter exposes them);
  - deny filesystem tools (`Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`, `Glob`, `Grep`), shell/process tools (`Bash`, terminal execution), MCP/project tools, runtime/plugin mutation, and unknown tools;
  - require pre-execution enforcement for both Claude and Codex;
  - allow only Locus-owned persistence (messages, jobs/events, diagnostics, attachment refs, save-dialog output chosen by the user).
- Do not include `TodoWrite` in the first assistant allow-list unless implementation proves it only writes Locus-owned chat state and cannot reach project or runtime state.

### 4. Claude and Codex full-scope enforcement
- Claude: extend `agent-sdk-tool-permission.ts` and query option assembly so assistant runs install a strict allow-list `canUseTool` plus SDK-level `disallowedTools` before SDK query starts. Known non-web Claude tools are removed from the model context; unknown tool names still deny by default when surfaced to the hook.
- Codex ACP: extend the ACP permission handler/mapping so assistant runs deny side-effecting tool requests before execution. If ACP cannot classify or intercept a tool, it fails closed for assistant runs.
- Codex app-server: extend the app-server approval gate so assistant runs deny file, shell, MCP/project, runtime mutation, and unknown approval requests before execution. If app-server approval hooks are unavailable, delayed, or cannot classify the request, the run fails closed before provider/tool work starts.
- Capability truth must reflect this. The feature can be presented as runtime-neutral only after both Claude and Codex report supported assistant-tier enforcement with tests. If either runtime is degraded, the UI must gate that runtime for quick chat or show an explicit downgrade.

### 5. Composer and transport
- `new-chat-form.tsx` already branches on `validatedProject`. When there is no project (quick chat): hide `WorkModeSelector` and the plan/agent toggle, show a static "助手" affordance, keep runtime/provider model selection only for runtimes with supported assistant enforcement, and keep send.
- New-chat entrypoints must set an explicit target (`quick` or `project(id)`) and `validatedProject` must derive from that target, not from the global `selectedProject`; the top-level new-chat button defaults to quick chat even if a project remains selected elsewhere.
- Remove the hard `!projectForChat` block in `handleSend` for the folderless path; `chats.create` accepts optional/null `projectId`.
- Renderer transports (`IPCChatTransport`, `ACPChatTransport`) must not mint their own assistant semantics. They pass the selected provider/runtime and current sub-chat mode as before; the main-process preflight and permission policy derive assistant controls from the null-project chat.

### 6. In-place upgrade (quick chat -> project workspace)
- New backend mutation `chats.attachProject({ chatId, projectId, useWorktree, baseBranch?, branchType?, targetMode })`.
- Preconditions:
  - chat exists, is not archived, has `projectId = null`, no `worktreePath`, no `branch`, no PR metadata;
  - target project exists;
  - no active stream/job is running for any sub-chat in the chat;
  - target mode is `plan | agent`.
- On attach: set `projectId`, optionally create the worktree, set the target mode for subsequent turns, keep message history visible, and move the chat from quick chat into the project's group.
- Default session behavior: do not resume the old assistant `sessionId` across cwd change. Clear or ignore the folderless session and start a fresh project-backed runtime session. Only enable cross-cwd resume if a dedicated end-to-end smoke proves it for the selected runtime; otherwise history handoff must come from persisted visible messages.

### 7. Sidebar: group only the unpinned section, reuse rows verbatim
- Keep drafts and the cross-project pinned section flat at the top; group only unpinned project-backed chats by `projectId` into collapsible project groups. Reuse `ChatListSection`/`ChatRow` unchanged inside each group so status, multi-select, pin, and context-menu behavior carry over.
- Add a top **quick chat** group (`projectId = null`) above pinned.
- New `collapsedProjects` state persisted to `localStorage`. Group order = most-recent-activity first; within a group, sort by `updatedAt`. Per-project "+" creates a chat in that project; the "项目" section header carries "+ 打开仓库".
- Keyboard navigation uses flat `filteredChats` plus `globalIndexMap`; rebuild `filteredChats` to match visual order (quick chat -> pinned -> each project group) so arrow navigation does not jump.
- Empty/first-run state renders the quick-chat composer instead of forcing a folder picker; remove the `validatedProject` early-return that made the button a no-op.

### 8. Delete vs archive: type-aware
- Wire the existing `chats.delete` into the UI.
- Quick chats (no worktree, no PR): delete is the primary one-click action.
- Code workspaces: archive stays primary; delete is secondary behind a confirm dialog, with a stronger confirm when the worktree has uncommitted changes or an open PR.
- Add "永久删除" per archived row and "清空归档" to `archive-popover.tsx`.
- Confirm `sub_chats` has `onDelete: cascade` on `chatId`; if not, delete must remove sub-chats explicitly to avoid orphans.

### 9. Uploads and assistant output
- Quick chat reads uploaded attachments from context and can rewrite them. Add a save/download action on assistant output so "edit content / rename file" is covered without a project via a user-chosen save dialog.
- Save/download is not filesystem tool access for the model. It is an explicit renderer/main-process user action after assistant output exists.
- Operations that need real multi-file/disk tooling route to the upgrade flow instead.

## Risks / Trade-offs

- Nullable `projectId` touches many read paths; mitigation is explicit folderless preflight plus repo-surface exclusion tests.
- Codex has two desktop adapter surfaces (ACP and app-server); both must prove assistant fail-closed behavior or the feature must gate that adapter.
- Cross-cwd session resume is unproven; defaulting to fresh project sessions avoids stale cwd/tool permissions leaking from quick chat into project mode.
- Reusing `ChatListSection` per group must not break flat keyboard order.

## Migration

- One additive Drizzle migration making `projectId` nullable. Existing rows are unaffected.
- Existing sub-chat modes remain `plan | agent`; no mode data migration is required.
