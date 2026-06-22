## ADDED Requirements
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
