# project-lifecycle Specification

## Purpose
Defines how Locus separates active project visibility from retained project history, including removal, restoration, destructive history deletion, and the shared lifecycle owner used by desktop and headless project flows.

## Requirements
### Requirement: Project Visibility Is Separate From History
The system SHALL distinguish active project registration from retained project history. Removing a project from the Projects list SHALL hide the project from active project selection without deleting chats, sub-chats, worktrees, job history, or repository files.

#### Scenario: User removes a project from the active list
- **WHEN** the user chooses to remove a project from the Projects list
- **THEN** Locus marks the project as removed or inactive through the shared
  project lifecycle owner
- **AND** active project lists no longer show that project by default
- **AND** chats, sub-chats, worktree metadata, job history, and repository files
  for that project remain intact

#### Scenario: User reopens the same project path
- **WHEN** a removed project exists for a canonical path
- **AND** the user opens or registers that same path again
- **THEN** Locus restores the existing project by clearing its removed state
- **AND** it does not create a duplicate project row for the same canonical path
- **AND** previously retained chats appear under the restored project

### Requirement: Project History Deletion Is Explicit And Destructive
The system SHALL permanently delete project chats and sub-chats only through an explicit Delete Project History action for removed projects that previews the affected local records and cleans Locus-owned workspace resources before deleting database rows.

#### Scenario: User previews project history deletion
- **WHEN** the user starts Delete Project History for a removed project
- **THEN** Locus reports the number of affected chats, sub-chats, worktrees, and
  active queued or running jobs
- **AND** the confirmation states that chat history will be permanently deleted
- **AND** the confirmation states that repository code files are not deleted

#### Scenario: Active project history deletion requires removal first
- **WHEN** the user views an active project
- **THEN** Delete Project History is not available for that active project
- **AND** Locus requires the project to be removed from the active Projects list
  before project history can be permanently deleted

#### Scenario: User confirms project history deletion
- **WHEN** the user confirms Delete Project History for a removed project
- **AND** there are no queued or running jobs for that removed project
- **THEN** Locus kills affected workspace terminal or agent processes
- **AND** removes Locus-created worktrees associated with the project's chats
- **AND** invalidates git caches for deleted worktree paths
- **AND** deletes the project chats and sub-chats from SQLite
- **AND** does not delete the user's repository directory or normal code files

#### Scenario: Cleanup fails before database deletion
- **WHEN** Locus cannot clean an affected worktree or workspace process during
  Delete Project History
- **THEN** Locus does not delete the project, chats, or sub-chats from SQLite
- **AND** it returns a renderer-safe diagnostic describing the failed cleanup
- **AND** the user can retry after resolving the cleanup problem

#### Scenario: Active jobs block destructive deletion
- **WHEN** a removed project has queued or running jobs
- **AND** the user starts Delete Project History
- **THEN** Locus refuses the destructive deletion
- **AND** it reports the active jobs that must finish or be canceled first

### Requirement: Removed Project Histories Are Viewable But Not Runnable
The system SHALL keep chats for removed projects available as history while blocking project-dependent runtime and workspace actions until the project is restored.

#### Scenario: User opens a removed project chat
- **WHEN** the user opens a chat whose project is removed from the active list
- **THEN** Locus renders the persisted messages and metadata as historical
  project history
- **AND** the UI indicates that the project is removed from active Projects
- **AND** the UI offers a restore action when the original project path is still
  available

#### Scenario: Project-dependent actions are disabled for removed project history
- **WHEN** the user is viewing a removed project chat
- **THEN** runtime send, worktree, terminal, diff, PR, file mention, and project
  MCP actions are unavailable
- **AND** Locus explains that restoring the project is required before project
  workflows can resume

### Requirement: Project Lifecycle Has One Shared Owner
The system SHALL route user-facing project registration, removal, restore, and history deletion through a shared main-process project lifecycle owner. Routes, headless command handlers, and renderer code SHALL NOT implement duplicate business rules for these lifecycle transitions.

#### Scenario: Desktop and headless project removal share behavior
- **WHEN** either the desktop Projects settings surface or the Local Job API
  unregister command removes a project from the active list
- **THEN** both callers use the shared lifecycle owner
- **AND** both preserve retained project history by default

#### Scenario: Raw project deletion is rejected for product lifecycle paths
- **WHEN** a production user-facing route or headless command deletes project
  lifecycle data
- **THEN** tests or architecture guards require it to call the shared lifecycle
  owner
- **AND** it does not raw-delete `projects` rows as its primary behavior
