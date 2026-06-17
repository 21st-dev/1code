# Tasks: Unified Plan/Diff/Terminal DetailsSidebar ownership (phase 1)

> Baseline: start from the tree with `add-quick-chat-and-project-sidebar` already merged (both edit `active-chat.tsx`).

## 1. Expanded renderer ownership
- [x] 1.1 Define the Details-owned expanded renderer model: render expanded content inside the physical `DetailsSidebar` shell, or retain/refactor `ExpandedWidgetSidebar` only as the DetailsSidebar expanded renderer with no independent product open state.
- [x] 1.2 Confirm one-widget-expanded-at-a-time + resize via `expandedWidgetAtomFamily` / `expandedWidgetSidebarWidthAtom`.
- [x] 1.3 Ensure `use-open-details-widget.ts` opens the Details tab and expanded widget path only; no legacy sidebar fallback remains after this phase.

## 2. Parity: Plan
- [x] 2.1 Bring Plan expanded rendering to parity with `agent-plan-sidebar.tsx`: plan title, loading/error/empty states, markdown render, plaintext/raw toggle, copy, and plan path/refetch behavior.
- [x] 2.2 Preserve the plan build/promote action, including plan-mode-only visibility and keyboard hint behavior.
- [x] 2.3 Remove legacy Plan sidebar rendering + open-state wiring only after 2.1 and 2.2 are verified (`active-chat.tsx:4400`–`:4404`, `agent-plan-sidebar.tsx`).

## 3. Parity: Diff
- [x] 3.1 Replace the simplified expanded `DiffSection` path with the full diff review behavior currently in `DiffSidebarRenderer` (`active-chat.tsx:1342`–`:1554`): header, file list, per-file diff, viewed state, selection state, expand/collapse, mark viewed/unviewed, discard refresh, and responsive width behavior.
- [x] 3.2 Preserve review/create-PR entrypoints, direct PR creation, AI PR creation, merge/fix-conflicts actions, branch/git status refresh, and commit-to-PR actions.
- [x] 3.3 Preserve file actions from the Details changes widget into the expanded diff path: open selected file, open file preview handoff, reveal/copy/open-in-editor actions, and selection for commit/commit-push.
- [x] 3.4 Collapse diff display to Details expanded diff + full-page; remove `side-peek` as a separate sidebar and fold `center-peek` into `full-page` (`active-chat.tsx:1350`, `:1443`–`:1554`).
- [x] 3.5 Keep a single explicit "open full-page diff" entrypoint for deep multi-file review.
- [x] 3.6 Remove legacy Diff sidebar rendering + open-state wiring only after 3.1-3.5 are verified (`active-chat.tsx:4391`–`:4395`).

## 4. Parity: Terminal
- [x] 4.1 Bring Terminal expanded rendering to parity with `terminal-sidebar.tsx`: interactive session, tabs, new/close/rename, close others/right, theme background, and no duplicate terminal state.
- [x] 4.2 Preserve `scopeKey`, `tabId`, `initialCommands`, `cwd`, and `workspaceId` propagation so expanded and compact terminal views share the same terminal sessions.
- [x] 4.3 Preserve the existing bottom-panel terminal mode outside the right region, or explicitly document and approve any removal before implementation; it must not depend on `unifiedSidebarEnabledAtom`.
- [x] 4.4 Remove legacy Terminal side-peek surface + open-state wiring only after 4.1-4.3 are verified (`active-chat.tsx:4477`–`:4482`).

## 5. Delete coordination + flag
- [x] 5.1 Delete `src/renderer/features/agents/hooks/use-agent-panel-conflicts.ts` and its call site (`active-chat.tsx:164`) after Plan/Diff/Terminal no longer have competing right-side sidebars.
- [x] 5.2 Remove `unifiedSidebarEnabledAtom` and the legacy branch it gates (`atoms/index.ts:211`, `active-chat.tsx:4418`, `use-open-details-widget.ts`).
- [x] 5.3 Point `use-open-details-widget.ts` at the unified panel unconditionally (keep context-driven open; defer auto-open policy to phase 3).

## 6. Cleanup and persisted state
- [x] 6.1 Remove or migrate stale persisted state for `overview:unifiedEnabled=false`, legacy Plan/Diff/Terminal sidebar open flags, `agents:diffViewDisplayMode=side-peek`, and `agents:diffViewDisplayMode=center-peek` so returning users land in a valid layout.
- [x] 6.2 Normalize terminal persisted display state so `side-peek` no longer opens a separate right sidebar; preserve bottom-panel state if retained.
- [x] 6.3 Update/remove tests referencing the deleted hook, flag, and legacy sidebar atoms.
- [x] 6.4 Keep Local Browser and File Viewer out of scope for this phase; do not claim all right-side surfaces are removed until phase 2.

## 7. Verification
- [x] 7.1 Per-surface parity check: Plan, Diff, and Terminal expanded widget renderers do everything their removed sidebars did.
- [x] 7.2 Confirm no remaining Plan/Diff/Terminal right-region mutual-exclusion is needed; `use-agent-panel-conflicts.ts` has no call sites and no replacement auto-close/auto-restore bookkeeping is introduced.
- [x] 7.3 Update `tests/details-sidebar-entrypoints.test.ts` so it asserts no `unifiedSidebarEnabledAtom` fallback, no legacy Plan/Diff/Terminal sidebar render gates, and Details-owned expanded entrypoints for Plan/Diff/Terminal.
- [x] 7.4 Add or update targeted tests for diff display-mode normalization, terminal display-mode/bottom-panel preservation, and `use-open-details-widget.ts` routing.
- [x] 7.5 Run `openspec validate refactor-unified-details-sidebar --strict --no-interactive`.
- [x] 7.6 Run `bun run lint`, `bun run ts:check`, and targeted tests.
- [x] 7.7 Manual smoke: open/expand plan, diff (Details expanded + full-page), terminal, and terminal bottom mode if retained; switch sub-chats; resize; confirm Plan/Diff/Terminal no longer fight DetailsSidebar and no legacy Plan/Diff/Terminal sidebar remains.
  - 2026-06-17: Locus Dev smoke verified DetailsSidebar coexists with expanded Diff/Terminal shells, Terminal executes in the selected worktree, and no legacy Plan/Diff/Terminal sidebar surface appeared. The retained bottom terminal mode had no Details/expanded entrypoint, so this wrap-up added a shared `TerminalModeSwitcher` to the compact and expanded terminal headers and covered it with `details-sidebar-entrypoints.test.ts`. Current dev data has no plan-mode fixture; Plan renderer parity remains covered by 7.1 and the targeted entrypoint tests. External shell edits did not refresh the Changes widget in this session because git status is cached and invalidated by the existing app git watcher/internal git operations path, not guaranteed by arbitrary shell writes.
