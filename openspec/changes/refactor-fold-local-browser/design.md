# Design: Fold the Local Browser into Details ownership (phase 2a)

Structural consolidation, same shape as Phase 1. The Local Browser is self-contained and maps 1:1 onto the Phase 1 render-prop pattern, so this is the low-risk half of the deferred work.

## Context

- Phase 1 established the Details-owned expanded renderer (`ExpandedWidgetSidebar`) driven by `expandedWidgetAtomFamily` / `expandedWidgetSidebarWidthAtom`, with heavy renderers injected by `active-chat` via a render-prop (`renderDiffContent`). One widget expanded at a time; collapse returns to the stack.
- Local Browser today: standalone `ResizableSidebar` (`active-chat.tsx:6970`); per-chat open state `localBrowserWorkbenchOpenAtomFamily` + `localBrowserWorkbenchWidthAtom`; capture→context via `pendingLocalBrowserReportAtomFamily` inserted into the composer (`active-chat.tsx:1681`); behavior governed by `local-browser-workbench` (preview boundary, diagnostics capture, context handoff).

## Goals / Non-Goals

- Goals: Local Browser owned by the Details model; remove its independent open-state + standalone mount; preserve capture/boundary behavior; exclude from folderless quick chat.
- Non-goals: File Viewer fold (separate change); Phase 3; any change to capture semantics or preview boundary.

## Decisions

### 1. Local Browser → Details widget + render-prop expand (reuse Phase 1 pattern)
- Add a `browser` entry to `WIDGET_REGISTRY` with `canExpand: true`. The stacked widget is a compact launcher/summary (dev-server URL, last-capture indicator, a capture action).
- Expanding mounts the full `LocalBrowserWorkbench` through `ExpandedWidgetSidebar` via a new `renderBrowserContent` render-prop injected by `active-chat` (mirror `renderDiffContent`), so the `details-sidebar` package keeps no dependency on the heavy browser/webview code.
- Remove `localBrowserWorkbenchOpenAtomFamily` and the standalone `ResizableSidebar` mount; open-state becomes the Details expanded-widget model. The Local Browser needs width — use a sufficient expanded width (the diff expanded default was 500; the browser may want wider).

### 2. Preserve capture → context (unchanged)
- `pendingLocalBrowserReportAtomFamily` → composer insert stays exactly as is. The `local-browser-workbench` preview boundary, diagnostics capture, and handoff requirements are unchanged — only the mount/ownership moves.

### 3. Quick-chat exclusion
- Folderless quick chats (no project/worktree) do not expose the `browser` widget, matching the formal "Quick Chat Surface Scope".

### 4. Parity before deletion (the gating rule)
- Bring the browser expanded renderer to parity (navigate/reload/viewport, diagnostics capture, screenshot, annotation, capture→context insert) **before** removing the standalone mount and open-state.

### 5. Persisted-state cleanup
- Normalize/drop the persisted Local Browser open flag so returning users do not try to open a removed standalone sidebar (follow the Phase 1 `normalizeTerminalDisplayMode` precedent).

## Risks / Trade-offs

- `active-chat.tsx` is the central edit; do parity-then-remove as one tight slice for the single surface.
- Browser width inside the Details expanded renderer must be adequate for the preview + capture panel; confirm before removing the standalone resizable sidebar.

## Migration / Sequencing

- Order: (a) add `browser` widget + render-prop expand at parity → (b) remove standalone mount + open-state → (c) quick-chat exclusion → (d) persisted-state cleanup → (e) tests.
- Archive this change before `refactor-fold-file-viewer`. This change replaces the formal deferred-right-side-surfaces scenario in `agent-workbench`; the File Viewer change should not archive while that formal scenario still says File Viewer may remain outside DetailsSidebar ownership.
