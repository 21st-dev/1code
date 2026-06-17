# Tasks: Fold the Local Browser into Details ownership (phase 2a)

> Baseline: `main` with Phase 1 shipped (`c81595e`). Reuse `ExpandedWidgetSidebar` render-prop + `expandedWidgetAtomFamily`.

## 1. Local Browser → Details widget
- [ ] 1.1 Add a `browser` entry to `WIDGET_REGISTRY` (`canExpand: true`) with a compact launcher/summary stacked widget (dev-server URL, last-capture indicator, capture action).
- [ ] 1.2 Add a `browser` case to `ExpandedWidgetSidebar` rendered via a `renderBrowserContent` render-prop (mirror `renderDiffContent`).
- [ ] 1.3 In `active-chat.tsx`, pass `renderBrowserContent` that mounts the full `LocalBrowserWorkbench` with its current props; ensure adequate expanded width for preview + capture panel.
- [ ] 1.4 Verify capture→context is unchanged: `pendingLocalBrowserReportAtomFamily` insert into the composer still works.

## 2. Remove the standalone surface
- [ ] 2.1 Remove the standalone Local Browser `ResizableSidebar` mount (`active-chat.tsx:6970`) only after 1.1–1.4 reach parity.
- [ ] 2.2 Remove `localBrowserWorkbenchOpenAtomFamily`; keep `pendingLocalBrowserReportAtomFamily`; fold/keep width.
- [ ] 2.3 Confirm no new right-region mutual-exclusion bookkeeping is introduced.

## 3. Quick-chat exclusion + persisted state
- [ ] 3.1 Hide/disable the `browser` widget for folderless quick chats / chats without a project worktree; use the existing folderless/worktree semantics rather than assuming a specific `projectId === null` field.
- [ ] 3.2 Normalize/drop the persisted Local Browser open flag so returning users do not open a removed standalone sidebar.

## 4. Verification
- [ ] 4.1 Parity check: the browser expanded renderer does everything the standalone sidebar did (navigate/reload/viewport, diagnostics, screenshot, annotation, capture→context).
- [ ] 4.2 Update/extend `tests/details-sidebar-entrypoints.test.ts` to assert the Local Browser is Details-owned (no standalone open-state).
- [ ] 4.3 Run `openspec validate refactor-fold-local-browser --strict --no-interactive`.
- [ ] 4.4 Run `bun run lint`, `bun run ts:check`, targeted tests, and `bun run architecture:check`.
- [ ] 4.5 Manual smoke: open/expand the browser from Details; capture → context insert; confirm no standalone Local Browser sidebar remains; folderless quick chat does not expose it.
