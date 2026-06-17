## MODIFIED Requirements

### Requirement: Embedded Local Browser Preview
The system SHALL provide an in-app browser panel for inspecting local pages, surfaced through the Details sidebar ownership model rather than as an independent right-side sidebar.

#### Scenario: User opens the workbench
- **WHEN** a workspace has a local worktree
- **THEN** the user can open a resizable browser preview from the Details sidebar (a Details-owned widget that expands through the Details expanded renderer)
- **AND** it does not mount as an independent competing right-side sidebar with its own open-state

#### Scenario: User reloads a page after edits
- **WHEN** the user clicks reload
- **THEN** the workbench reloads the current local URL
- **AND** preserves the URL for repeat smoke checks

#### Scenario: User changes viewport
- **WHEN** the user switches between desktop and mobile viewport controls
- **THEN** the preview uses the selected viewport dimensions without changing the loaded URL
