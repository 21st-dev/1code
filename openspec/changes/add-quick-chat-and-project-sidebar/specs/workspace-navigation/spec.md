## ADDED Requirements

### Requirement: Project-Grouped Workspace Tree
The left sidebar SHALL group workspaces under their project as a collapsible two-level tree, while preserving existing per-row status, multi-select, pin, and context-menu behavior.

#### Scenario: Workspaces grouped by project
- **WHEN** the sidebar shows workspaces that belong to projects
- **THEN** each project is a collapsible group header with its workspaces nested beneath it
- **AND** each workspace row keeps its existing status indicators (unseen changes, pending plan, pending question, running, PR, diff stats)
- **AND** multi-select, pin, and context-menu actions continue to work on grouped rows

#### Scenario: Collapse state persists
- **WHEN** the user collapses or expands a project group
- **THEN** the collapsed state is remembered across app restarts

#### Scenario: Long project is truncated
- **WHEN** a project has more workspaces than the display threshold
- **THEN** only the most recent are shown with an expand affordance to reveal the rest

### Requirement: Quick Chat Group
The sidebar SHALL show folderless quick chats in a dedicated group above the project groups.

#### Scenario: Quick chats appear at the top
- **WHEN** folderless quick chats exist
- **THEN** they are listed in a "快速对话" group above pinned and project groups
- **AND** they are not nested under any project

### Requirement: Navigation Entry Points
The sidebar SHALL provide distinct entry points for creating a quick chat, opening a repository, and creating a workspace in a specific project.

#### Scenario: Open a repository
- **WHEN** the user activates "open repository" from the projects section header
- **THEN** the system opens the folder/clone picker and adds the project

#### Scenario: New conversation in a project
- **WHEN** the user activates the "+" on a project group header
- **THEN** a new workspace is started in that project without re-picking a folder

#### Scenario: Top new-chat default
- **WHEN** the user activates the top "新建会话" action
- **THEN** a folderless quick chat composer is shown

### Requirement: Keyboard Navigation Order Matches Display
Keyboard up/down navigation SHALL traverse rows in the same order they are displayed.

#### Scenario: Arrow keys follow visual order
- **WHEN** the user navigates the sidebar with arrow keys
- **THEN** focus moves in the visual order (quick chat, then pinned, then each project group) without jumping out of order

### Requirement: Type-Aware Delete And Archive
The sidebar and archive surface SHALL allow permanent deletion of chats, with affordances matched to chat type.

#### Scenario: Delete a quick chat
- **WHEN** the user deletes a folderless quick chat
- **THEN** the chat is permanently removed in one step without an archive step

#### Scenario: Delete a code workspace
- **WHEN** the user deletes a workspace that has a worktree or open PR
- **THEN** archive remains the primary action and delete requires confirmation
- **AND** the confirmation is stronger when the worktree has uncommitted changes or an open PR

#### Scenario: Permanently clear the archive
- **WHEN** the user opens the archive surface
- **THEN** each archived chat can be permanently deleted
- **AND** the archive can be cleared
