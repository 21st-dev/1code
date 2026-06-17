# Tasks: Fold the File Viewer into Details ownership (phase 2b)

> Baseline: `main` with Phase 1 shipped (`c81595e`). Reuse `ExpandedWidgetSidebar` render-prop, `expandedWidgetAtomFamily`, and the `normalizeTerminalDisplayMode` migration precedent.

## 1. Details-owned file state + preview surface
- [x] 1.1 Add a per-chat `selectedFileAtom` in the DetailsSidebar atom owner (`src/renderer/features/details-sidebar/atoms/index.ts` or a dedicated `details-sidebar/atoms/file-viewer.ts`) as the single source of truth for the open/previewed file; replace `fileViewerOpenAtomFamily`.
- [x] 1.2 Derive the Files-tab tree active/selected highlight from `selectedFileAtom` so navigator and preview stay in sync.
- [x] 1.3 Render the preview as a Details expanded file surface via a `renderFileContent` render-prop injected by `active-chat` (mirror `renderDiffContent`); keep a full-page mode for deep viewing.

## 2. Entrypoint re-route (choke point first)
- [x] 2.1 Re-point `FileOpenProvider.onOpenFile` (`active-chat.tsx:6541`) to set `selectedFileAtom` instead of opening the standalone viewer — this re-routes tool cards, file mentions, git badges, and diff "open file" at once.
- [x] 2.2 Enumerate and re-route any **direct** `fileViewerOpenAtomFamily` callers outside the provider to the same state.

## 3. Display-mode normalization
- [x] 3.1 Collapse `FileViewerDisplayMode` to Details-expanded + full-page; remove `side-peek`/`center-peek` as separate competing surfaces.
- [x] 3.2 Normalize the persisted `agents:fileViewerDisplayMode` so legacy `side-peek`/`center-peek` map to a valid post-change state.

## 4. Quick-chat exclusion + remove standalone
- [x] 4.1 Do not expose the repository File Viewer for folderless quick chats / chats without a project worktree; use the existing folderless/worktree semantics rather than assuming a specific `projectId === null` field.
- [x] 4.2 Remove the standalone `FileViewerSidebar` mount(s) (`active-chat.tsx:7008`+) and `fileViewerOpenAtomFamily` only after the Details-owned path reaches parity.
- [x] 4.3 Confirm no new right-region mutual-exclusion bookkeeping is introduced.

## 5. Preserve performance
- [x] 5.1 Verify large-file/virtualized rendering in the Details-owned surface matches the standalone viewer; do not regress `file-viewer-performance`.

## 6. Verification
- [x] 6.1 Parity check: open file, virtualized/large-file rendering, reveal/copy/open-in-editor, add-to-context, viewed/selection state all work in the Details-owned surface.
- [x] 6.2 Update/extend `tests/details-sidebar-entrypoints.test.ts` to assert the File Viewer is Details-owned (single `selectedFileAtom`, no standalone open-state) and that `FileOpenProvider` routes into it.
- [x] 6.3 Run `openspec validate refactor-fold-file-viewer --strict --no-interactive`.
- [x] 6.4 Run `bun run lint`, `bun run ts:check`, targeted tests, and `bun run architecture:check`.
- [x] 6.5 Manual smoke: open files from the Files tree, diff "open file", a tool card / file mention / git badge — all land in the single Details-owned file surface; no standalone File Viewer sidebar remains; folderless quick chat does not expose it.
- [x] 6.6 Before archive, confirm `refactor-fold-local-browser` has already been archived and the formal `agent-workbench` spec no longer says File Viewer may remain outside DetailsSidebar ownership.

Verification evidence: CDP smoke opened `package.json` from Files tree into the Details-owned `文件预览` surface, opened large `active-chat.tsx` through File Search into the same surface, switched Details-expanded -> full-page -> Details-expanded, and confirmed folderless quick chat did not expose repository file preview. Entrypoint guard coverage verifies `FileOpenProvider`, direct diff callers, tool-card/file-mention/git-badge callers, and removal of standalone `fileViewerOpenAtomFamily`/`side-peek`/`center-peek` paths.
