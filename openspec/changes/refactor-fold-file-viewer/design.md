# Design: Fold the File Viewer into Details ownership (phase 2b)

Re-homing a small subsystem (tree + preview + display modes + a provider-based entrypoint web), not deleting a duplicate. The decisions below resolve the gaps found reviewing the original combined proposal.

## Context

- Details "files" tab = a **tree only**; `activateFile → onSelectFile(worktreePath + "/" + path)` delegates opening to a parent callback (`files-tab.tsx:424`).
- Preview lives in a **separate viewer** with display modes `side-peek | center-peek | full-page` (`fileViewerDisplayModeAtom`, `atoms/index.ts:1055`; `file-viewer-sidebar.tsx:74`) and open-state `fileViewerOpenAtomFamily`.
- Opens flow through **`<FileOpenProvider onOpenFile={setFileViewerPath}>`** (`active-chat.tsx:6541`): tool cards, file mentions, git activity badges, and diff "open file" all call the provider's `onOpenFile`; some direct `fileViewerOpenAtomFamily` callers also exist.
- Phase 1 precedents to reuse: the `ExpandedWidgetSidebar` render-prop (`renderDiffContent`), the `expandedWidgetAtomFamily` model, and `normalizeTerminalDisplayMode` for persisted-mode migration.

## Goals / Non-Goals

- Goals: one Details-owned file surface; a clear selected/open-file state owner; complete entrypoint re-route; display-mode normalization; preserved performance; quick-chat exclusion.
- Non-goals: Local Browser fold (2a); Phase 3; any change to `file-viewer-performance` rendering requirements.

## Decisions

### 1. Details-owned selected/open-file state owner
- Add a per-chat `selectedFileAtom` as the single source of truth for "which file is open / previewed". Its canonical owner is the DetailsSidebar atom package (`src/renderer/features/details-sidebar/atoms/index.ts` or a dedicated `details-sidebar/atoms/file-viewer.ts` module), not the legacy agents atom owner. It replaces `fileViewerOpenAtomFamily`.
- The Files-tab tree's active/selected highlight derives from `selectedFileAtom` (today it derives from the external open-state), so the navigator and preview stay in sync.

### 2. Preview placement: Files tab = navigator, preview = Details expanded file surface
- The Files tab tree remains the navigator. Selecting a file sets `selectedFileAtom` and renders the preview as a **Details expanded file surface** via a `renderFileContent` render-prop injected by `active-chat` (mirror `renderDiffContent`), so `details-sidebar` keeps no dependency on the heavy file-viewer/monaco code.
- Keep a **full-page** mode for deep viewing of large files; drop the narrow `side-peek`/`center-peek` competing modes.

### 3. `FileOpenProvider` is the single choke point for entrypoints
- Re-point `FileOpenProvider.onOpenFile` to set `selectedFileAtom` (instead of `setFileViewerPath` → external sidebar). This re-routes **all** indirect entrypoints (tool cards, mentions, git badges, diff open-file) in one place.
- Then sweep any **direct** `fileViewerOpenAtomFamily` callers outside the provider and point them at the same state. Enumerate by reference, not by guess.

### 4. Display-mode normalization
- Collapse `FileViewerDisplayMode` to **Details-expanded + full-page**; remove `side-peek` and `center-peek` as separate competing surfaces.
- Normalize the persisted `agents:fileViewerDisplayMode` so `side-peek`/`center-peek` map to a valid post-change state (mirrors Phase 1 diff-mode normalization).

### 5. Quick-chat exclusion
- The repository File Viewer is not exposed for folderless quick chats / chats without a project worktree, matching the formal "Quick Chat Surface Scope". The implementation should use the existing folderless/worktree semantics (for example `isFolderlessChat` and/or missing `worktreePath`) rather than assuming a specific `projectId === null` field.

### 6. Preserve performance (only re-home)
- The existing virtualization/large-file rendering behind `file-viewer-performance` is unchanged; this change only moves where the viewer mounts and who owns its open-state.

### 7. Parity before deletion
- Bring the Details-owned file surface to parity (open file, large-file/virtualized rendering, reveal/copy/open-in-editor, add-to-context, viewed/selection state) **before** removing the standalone `FileViewerSidebar` mount and `fileViewerOpenAtomFamily`.

## Risks / Trade-offs

- The main risk is a missed open path. Mitigation: the `FileOpenProvider` choke point covers the indirect web; the residual risk is direct atom callers outside the provider — enumerate them explicitly.
- Preview width: the Details expanded surface must be wide enough for code; reuse the diff expanded width or allow wider.
- Performance: do not regress `file-viewer-performance`; verify large-file rendering in the Details-owned surface matches the standalone viewer.

## Spec strategy (avoid cross-change collision)

- This change **ADDS** a new `File Viewer Details Ownership` requirement to `agent-workbench` rather than re-modifying the shared `Unified Details Inspector Ownership` requirement that `refactor-fold-local-browser` modifies. ADDED vs a different requirement avoids a lossy MODIFIED collision while both changes are active.
- Archive order still matters: archive `refactor-fold-local-browser` first so the formal `Unified Details Inspector Ownership` requirement no longer contains the deferred-right-side-surfaces scenario that says File Viewer may remain outside DetailsSidebar ownership. Only archive this change after that formal spec no longer contradicts File Viewer ownership.

## Migration / Sequencing

- Order: (a) add `selectedFileAtom` + render-prop preview at parity; (b) re-point `FileOpenProvider.onOpenFile` + sweep direct callers; (c) normalize display modes + persisted value; (d) quick-chat exclusion; (e) remove standalone `FileViewerSidebar` + open-state; (f) tests.
