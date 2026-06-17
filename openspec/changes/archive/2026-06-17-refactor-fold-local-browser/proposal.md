# Change: Fold the Local Browser into Details ownership (phase 2a)

## Why

Phase 1 (`refactor-unified-details-sidebar`, archived) made the DetailsSidebar the single owner of Plan, Diff, and Terminal, and explicitly deferred two right-side surfaces: the **Local Browser** and the **File Viewer** (the archived `agent-workbench` "Deferred right-side surfaces remain out of scope" scenario).

This change folds the **Local Browser** — the clean, self-contained one. The **File Viewer** is heavier (a file tree + an external preview with its own display modes + a `FileOpenProvider` consumed by many indirect entrypoints) and is handled in a separate change, `refactor-fold-file-viewer` (phase 2b).

Today the Local Browser is a standalone `ResizableSidebar` with its own per-chat open state (`localBrowserWorkbenchOpenAtomFamily`, `localBrowserWorkbenchWidthAtom`), mounted directly in the chat view (`src/renderer/features/agents/main/active-chat.tsx:6970`). It is not part of the Details widget model and is covered by no right-region coordination — exactly the kind of independent surface Phase 1 set out to end.

## What Changes

- Make the Local Browser a Details-owned surface: a `browser` entry in `WIDGET_REGISTRY` (`canExpand: true`) with a compact launcher/summary stacked widget, that **expands** through the existing `ExpandedWidgetSidebar` render-prop path (the same mechanism Phase 1 used for Diff) into the full `LocalBrowserWorkbench`.
- Remove the independent open-state atom and the standalone `ResizableSidebar` mount; open-state becomes the Details expanded-widget model.
- Preserve all Local Browser behavior: the preview boundary, diagnostics capture, and capture→context handoff (`pendingLocalBrowserReportAtomFamily` → composer insert).
- Exclude the Local Browser from folderless quick chats (consistent with the formal "Quick Chat Surface Scope").
- Normalize/drop persisted Local Browser open-state so returning users do not try to open a removed standalone sidebar.

## Impact

- Affected specs: `agent-workbench` (MODIFIES `Unified Details Inspector Ownership`), `local-browser-workbench` (MODIFIES `Embedded Local Browser Preview`)
- Baseline: `main` with Phase 1 shipped (`c81595e`); reuses the Phase 1 `ExpandedWidgetSidebar` render-prop + `expandedWidgetAtomFamily` model.
- Affected code:
  - `src/renderer/features/details-sidebar/atoms/index.ts` (add `browser` to `WIDGET_REGISTRY`)
  - `src/renderer/features/details-sidebar/expanded-widget-sidebar.tsx` (browser case via `renderBrowserContent` render-prop)
  - `src/renderer/features/agents/main/active-chat.tsx` (pass `renderBrowserContent` mounting `LocalBrowserWorkbench`; remove the standalone Local Browser `ResizableSidebar` mount at `:6970`)
  - `src/renderer/features/agents/atoms/index.ts` (remove `localBrowserWorkbenchOpenAtomFamily`; fold width into `expandedWidgetSidebarWidthAtom` or keep as the expanded width; keep `pendingLocalBrowserReportAtomFamily`)
  - i18n for the widget label; tests
- Non-goals:
  - The File Viewer fold — separate change `refactor-fold-file-viewer` (phase 2b).
  - Phase 3 (reorder, commit/push, quick-chat degradation, auto-open, perf).
  - No change to the Local Browser capture pipeline semantics or preview boundary — only placement/ownership moves.
