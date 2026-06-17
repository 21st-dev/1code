## MODIFIED Requirements

### Requirement: Quick Chat Handles Uploaded Files Without A Project
A quick chat SHALL read uploaded file attachments from context and let the user save assistant output as a file, without requiring a project.

#### Scenario: Rewrite an uploaded file
- **WHEN** the user uploads a file to a quick chat and asks to modify its content
- **THEN** the assistant reads the uploaded content and returns the modified version
- **AND** the user can save or download the result as a file through an explicit user action

#### Scenario: Operation needs real file tooling
- **WHEN** the requested operation requires multi-step changes to real files on disk
- **THEN** the system offers the "Attach a Project" entry point rather than performing host filesystem operations in the quick chat

### Requirement: In-Place Upgrade To A Project Workspace
A quick chat SHALL be upgradable in place into a project workspace through the "Attach a Project" entry point, preserving prior Chat history.

#### Scenario: Attach a Project to a quick chat
- **WHEN** the user activates "Attach a Project" for a quick chat from the composer
- **THEN** the chat becomes associated with that project (optionally with a worktree)
- **AND** prior assistant messages remain visible as Chat history
- **AND** subsequent turns run through project-backed preflight with the project working directory and plan/agent permissions
- **AND** the chat moves from the quick-chat group into that project's group in navigation

#### Scenario: Attach uses a fresh project-backed runtime session
- **WHEN** a quick chat is upgraded to a project workspace
- **THEN** the old folderless assistant session is cleared or ignored by default
- **AND** the next runtime turn starts from a fresh project-backed session unless a dedicated end-to-end test proves safe cross-cwd resume for the selected runtime
