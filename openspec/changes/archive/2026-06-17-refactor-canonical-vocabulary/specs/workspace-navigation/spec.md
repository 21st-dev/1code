## MODIFIED Requirements

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
