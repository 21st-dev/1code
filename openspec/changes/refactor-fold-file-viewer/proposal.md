# Change: Fold the File Viewer into Details ownership (phase 2b)

## Why

Phase 1 deferred two right-side surfaces; `refactor-fold-local-browser` (phase 2a) folds the Local Browser. This change folds the **File Viewer**, which is the heavier of the two and was under-specified in the original combined proposal.

The File Viewer is not "a duplicate sidebar to delete." It is a small subsystem:

- The Details **"files" tab is only a file tree** — `FilesTab.activateFile → onSelectFile(...)` (a parent callback), not the preview itself (`src/renderer/features/details-sidebar/sections/files-tab.tsx:424`).
- The actual preview is a **separate viewer** with its own display modes — `fileViewerDisplayModeAtom` = `side-peek | center-peek | full-page` (`src/renderer/features/agents/atoms/index.ts:1055`, `file-viewer-sidebar.tsx:74`).
- It is opened through a **`FileOpenProvider` context** consumed by many indirect entrypoints (tool cards, file mentions, git activity badges, diff "open file") plus direct `fileViewerOpenAtomFamily` callers (`src/renderer/features/agents/main/active-chat.tsx:6541`).

So folding it requires a real ownership design: a Details-owned selected/open-file state, a decision on where the preview renders, display-mode migration, and a complete entrypoint re-route — not just removing an open-state atom.

## What Changes

- Introduce a **Details-owned selected/open-file state owner** (a new per-chat `selectedFileAtom`) that replaces `fileViewerOpenAtomFamily` as the source of truth for "which file is open".
- Render the preview as a **Details expanded file surface** via a `renderFileContent` render-prop (the same mechanism Phase 1 used for Diff); the Files tab tree remains the navigator. Keep a full-page mode for deep viewing.
- **Re-point `FileOpenProvider.onOpenFile`** to set the Details-owned state — this single choke point re-routes all indirect entrypoints at once; then sweep any direct `fileViewerOpenAtomFamily` callers outside the provider.
- **Normalize display modes**: collapse `side-peek | center-peek | full-page` to **Details-expanded + full-page**; drop `side-peek`/`center-peek` and normalize the persisted `agents:fileViewerDisplayMode` value (mirrors the Phase 1 diff-mode normalization).
- Remove the standalone `FileViewerSidebar` mount and its independent open-state only after the Details-owned path reaches parity.
- Exclude the repository File Viewer from folderless quick chats (formal "Quick Chat Surface Scope").
- Preserve `file-viewer-performance` behavior (virtualization/large-file handling) — only the mount/ownership moves, not the rendering.

## Impact

- Affected specs: `agent-workbench` (ADDS `File Viewer Details Ownership`)
- Baseline: `main` with Phase 1 shipped (`c81595e`).
- Archive dependency: `refactor-fold-local-browser` MUST archive before this change, because the current formal `agent-workbench` spec still contains the deferred-right-side-surfaces scenario until 2a replaces it. Do not archive this File Viewer change while that scenario still says File Viewer may remain outside the DetailsSidebar ownership model.
- Affected code:
  - `src/renderer/features/details-sidebar/atoms/index.ts` or a dedicated `src/renderer/features/details-sidebar/atoms/file-viewer.ts` module (canonical Details-owned `selectedFileAtom`)
  - `src/renderer/features/agents/atoms/index.ts` (remove `fileViewerOpenAtomFamily`; normalize `fileViewerDisplayModeAtom`; keep only compatibility facades if needed during the same migration slice)
  - `src/renderer/features/agents/main/active-chat.tsx` (re-point `FileOpenProvider.onOpenFile`; pass `renderFileContent`; remove standalone `FileViewerSidebar` mount(s) at `:7008`+)
  - `src/renderer/features/details-sidebar/expanded-widget-sidebar.tsx` + `details-sidebar.tsx` + `sections/files-tab.tsx` (Details-owned file preview surface)
  - `src/renderer/features/file-viewer/*` (mount through Details, not standalone)
  - tests
- Non-goals:
  - The Local Browser fold — separate change `refactor-fold-local-browser` (phase 2a).
  - Phase 3 (reorder, commit/push, quick-chat degradation, auto-open, perf).
  - No change to `file-viewer-performance` requirements — only placement/ownership/display-mode normalization.
