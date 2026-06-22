# workspace-navigation Specification

## Purpose
TBD - created by archiving change add-quick-chat-and-project-sidebar. Update Purpose after archive.
## Requirements
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
The sidebar SHALL provide distinct entry points for creating a quick chat, opening a project, and creating a workspace in a specific project.

#### Scenario: Open a project
- **WHEN** the user activates "Open a Project" from the projects section header
- **THEN** the system opens the folder/clone picker and adds the project

#### Scenario: New workspace in a project
- **WHEN** the user activates the "+" on a project group header
- **THEN** a new workspace is started in that project without re-picking a folder

#### Scenario: Top new-quick-chat default
- **WHEN** the user activates the top "New Quick chat" action
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

### Requirement: Removed Project History Surface
The navigation or archive/history surface SHALL expose removed projects separately from active project groups so users can inspect retained history, restore a project, or explicitly delete project history.

#### Scenario: Removed projects are not active project groups
- **WHEN** a project has been removed from the active Projects list
- **THEN** the main active project navigation no longer displays it as an active
  project group
- **AND** its retained chats remain reachable from a removed-project history or
  archive surface

#### Scenario: User restores a removed project
- **WHEN** the user activates Restore for a removed project
- **THEN** Locus clears the project's removed state through the shared lifecycle
  owner
- **AND** the project returns to the active project list with its retained chats
  still linked

#### Scenario: User deletes removed project history
- **WHEN** the user activates Delete Project History from the removed-project
  history surface
- **THEN** Locus shows the destructive deletion preview and confirmation
- **AND** permanent deletion follows the shared project lifecycle deletion rules

#### Scenario: Removed project chat opens as history
- **WHEN** the user opens a chat from a removed project history group
- **THEN** the chat opens in a historical/read-only project state
- **AND** the surface provides a restore affordance instead of project workflow
  actions that require an active project

