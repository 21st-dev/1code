## MODIFIED Requirements

### Requirement: Local Agent Workbench Overview
The system SHALL provide a local Agent Workbench that summarizes coding-agent tasks from local projects, project-backed chats, worktrees, and sub-chats.

#### Scenario: User opens the workbench
- **WHEN** the user opens the Agent Workbench
- **THEN** the app lists local task cards derived from eligible non-archived project-backed chats and their latest sub-chat context
- **AND** folderless quick chats are excluded from the workbench because they have no project, worktree, diff, terminal, or PR context
- **AND** each card shows project, chat title, branch or local-directory mode, latest sub-chat, worktree path availability, status, and last updated time
- **AND** the app does not contact hosted upstream product services to populate the list

#### Scenario: No local tasks exist
- **WHEN** the user opens the Agent Workbench and no eligible project-backed chats exist
- **THEN** the app shows an empty state that points users to create or select a local project chat
