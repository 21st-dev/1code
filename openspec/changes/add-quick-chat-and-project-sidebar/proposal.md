# Change: Add folderless quick chat and project-grouped sidebar

## Why

Locus is positioned as **general assistant + code**, but today every chat is hard-bound to a project folder: `chats.projectId` is `NOT NULL` with a cascading FK (`src/main/lib/db/schema/index.ts:37`), and `handleSend` refuses to send without a project (`src/renderer/features/agents/main/new-chat-form.tsx:1189`). There is no path for everyday, non-coding use ("write this email", "explain RAG") without attaching a meaningless repository.

The left sidebar compounds this. It renders a flat chat list with the project shown only as a per-row sub-label, so the real `project -> workspace` hierarchy is invisible. This is the root of the original report that "新建工作区 does nothing": `openProjectPickerForNewWorkspace` early-returns when a project is already selected (`src/renderer/features/layout/agents-layout.tsx:174`), so the prominent button looks dead and there is no obvious place to add a different folder.

Chat removal is also incomplete: a full hard-delete exists in the backend (`src/main/lib/trpc/routers/chats-crud.ts:518`) but is wired to no UI, and the archive surface only restores. Archived chats accumulate with no per-chat removal. Once disposable folderless chats exist, archive-only becomes the wrong default for them.

## What Changes

- Allow folderless **quick chat** general-assistant sessions: `chats.projectId` becomes nullable; a quick chat has `projectId = null` and is treated as a folderless workspace kind.
- Add a runtime-neutral **assistant** permission control level for folderless runs. `assistant` is not a third global `AgentJobMode`; persisted sub-chat modes stay `plan | agent`, while preflight and permission policy derive assistant controls from the folderless workspace context.
- Support both Claude and Codex quick chats. Claude SDK, Codex ACP, and Codex app-server paths must deny filesystem, shell, MCP/project, and unknown tools before execution; if Codex cannot install a pre-tool fail-closed gate for the selected adapter, the run must fail before provider/tool work starts.
- Change desktop runtime preflight to verify two explicit context shapes: project-backed runs keep the existing project/cwd validation, and folderless runs use a main-process-owned scratch cwd with `project = null`.
- Restructure the left sidebar into a `project -> workspace` collapsible tree, with a top **quick chat** group, a cross-project **pinned** section, **drafts**, and **archive**; add an explicit **open repository** entry and a per-project **new conversation** entry.
- Collapse the new-chat composer to a single **assistant** affordance when no project is selected (hide plan/agent and worktree/local controls), and allow send without a project.
- Support **in-place upgrade** of a quick chat into a project workspace (attach a folder), preserving prior assistant history as visible context while starting a fresh project-backed runtime session unless end-to-end evidence proves safe resume across cwd changes.
- Wire the existing backend chat delete into the UI with type-aware affordances: quick chats delete in one click; code workspaces keep archive as primary with delete behind confirmation (extra confirmation when a worktree has uncommitted changes or an open PR). Add **permanent delete / clear** to the archive surface.
- Add a **save/download** capability for assistant output so uploaded files can be rewritten and saved without a project; multi-step real-file operations route to the upgrade flow.
- Exclude quick chats from workbench, kanban, terminal, diff, PR, and other repository-centric surfaces; include them in search.
- Land the empty/first-run state on the quick-chat composer, removing the folder-picker no-op that made "新建工作区" appear broken.
- Localize all new strings in English and Simplified Chinese; the second tree level is displayed as "工作区" and folderless chats as "快速对话".

## Impact

- Affected specs: `general-assistant-chat` (new), `workspace-navigation` (new), `agent-runtime-core`, `agent-runtime-capabilities`, `agent-workbench`, `agent-chat-attachments`, `project-onboarding`, `ui-localization`
- Affected code:
  - Data: `src/main/lib/db/schema/index.ts` (nullable `projectId`), new Drizzle migration under `drizzle/`
  - Runtime preflight/request: `src/main/lib/agent-runtime/preflight.ts`, `src/main/lib/agent-runtime/desktop-run-request.ts`, Claude/Codex desktop run request builders
  - Backend chat CRUD: `src/main/lib/trpc/routers/chats-crud.ts` (`create` accepts null project, new `attachProject`, list/get tolerate null `projectId`, delete already present)
  - Runtime routes/adapters: `src/main/lib/trpc/routers/claude.ts`, `src/main/lib/trpc/routers/codex.ts`, `src/main/lib/codex/acp-adapter.ts`, Codex app-server permission bridge
  - Permission/capability: `src/main/lib/agent-runtime/permission-policy.ts`, `src/main/lib/claude/agent-sdk-tool-permission.ts`, Codex ACP/app-server permission mapping, `src/shared/agent-runtime-capabilities.ts`, `src/shared/codex-runtime-capabilities.ts`
  - Renderer: `src/renderer/features/agents/main/new-chat-form.tsx`, `src/renderer/features/agents/main/active-chat.tsx`, `src/renderer/features/agents/main/chat-input-area.tsx`, `src/renderer/features/sidebar/agents-sidebar.tsx`, `src/renderer/features/agents/ui/archive-popover.tsx`, `src/renderer/features/layout/agents-layout.tsx`, `src/renderer/features/agents/ui/agents-content.tsx`
  - i18n: `src/renderer/lib/i18n/dictionaries.ts`
- Non-goals (deferred):
  - The 3-B scoped sandbox tier (file tools jailed to an upload-only sandbox) - folderless chats stay pure assistant for now.
  - Redesign of the workbench and kanban modules.
  - A global rename of the "workspace" term - only the sidebar display label changes.
  - Changes to provider credential storage or transport authentication.
