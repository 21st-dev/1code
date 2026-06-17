## ADDED Requirements

### Requirement: File Viewer Details Ownership
The File Viewer SHALL be owned by the Details sidebar model: a Details-owned selected/open-file state drives a single Details file surface (the Files-tab navigator plus a Details expanded file preview), and there SHALL NOT be an independent competing File Viewer right-side sidebar.

#### Scenario: Opening a file uses the Details-owned surface
- **WHEN** the user opens a file from the Files tree, the diff "open file" action, a tool card, a file mention, or a git activity badge
- **THEN** the file opens in the single Details-owned file surface (a Details expanded file preview), not a separate File Viewer sidebar
- **AND** the open/selected file is tracked by a Details-owned selected-file state rather than the standalone `fileViewerOpenAtomFamily`
- **AND** the Files-tab tree highlight reflects the same selected-file state

#### Scenario: Indirect open entrypoints route through the choke point
- **WHEN** any `FileOpenProvider` consumer requests to open a file
- **THEN** the provider sets the Details-owned selected-file state
- **AND** no consumer opens an independent File Viewer sidebar

#### Scenario: File viewer display modes are normalized
- **WHEN** a returning user has a persisted file-viewer display mode of `side-peek` or `center-peek`
- **THEN** it is normalized to a valid post-change state (Details-expanded or full-page)
- **AND** `side-peek` and `center-peek` no longer open a separate competing right-side surface

#### Scenario: Performance behavior is preserved
- **WHEN** a large file is opened in the Details-owned file surface
- **THEN** existing file-viewer virtualization/large-file rendering behavior is preserved

#### Scenario: Folderless quick chats do not expose the File Viewer
- **WHEN** a folderless quick chat (no project) is active
- **THEN** the repository File Viewer is not offered
- **AND** this matches the established quick-chat surface scope for repository-centric surfaces
