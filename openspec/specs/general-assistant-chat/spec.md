# general-assistant-chat Specification

## Purpose
TBD - created by archiving change add-quick-chat-and-project-sidebar. Update Purpose after archive.
## Requirements
### Requirement: Folderless Quick Chat Sessions
The system SHALL allow chat sessions that are not bound to any project folder, so the user can use Locus as a general assistant without selecting a repository.

#### Scenario: Start a chat with no project
- **WHEN** the user starts a new chat without selecting a project
- **THEN** the system creates a chat with no associated project
- **AND** the chat can send and receive messages without a project folder
- **AND** the chat is shown as a "快速对话" entry in navigation

#### Scenario: First run lands on the assistant composer
- **WHEN** the app opens with no project selected
- **THEN** the assistant composer is shown directly
- **AND** the user is not forced to pick a folder before sending a first message

### Requirement: Assistant Permission Tier
A folderless quick chat SHALL run under an assistant permission control level that allows web-information tools and denies filesystem, shell, terminal, MCP/project, runtime mutation, and unknown tools before execution.

#### Scenario: Assistant answers a general question
- **WHEN** a quick chat run executes through Claude or Codex
- **THEN** web information tools (such as web search and fetch) are available when supported by the selected runtime
- **AND** filesystem tools (read, edit, write, multi-edit, notebook edit, glob, grep) are denied before execution
- **AND** shell, terminal, MCP/project, runtime mutation, and unknown tools are denied before execution

#### Scenario: Assistant cannot reach the host filesystem
- **WHEN** the model attempts a filesystem, shell, terminal, MCP/project, or unknown tool in a quick chat
- **THEN** the tool call is denied before execution
- **AND** no host project, home directory, or project MCP configuration is read or modified

#### Scenario: Runtime cannot enforce assistant controls
- **WHEN** the selected Claude or Codex adapter cannot install or prove the assistant pre-tool enforcement gate
- **THEN** the quick-chat run fails closed before provider or tool work starts
- **AND** the UI does not present that runtime as available for quick chat without an explicit degraded-state explanation

### Requirement: Assistant Composer
When no project is selected, the new-chat composer SHALL collapse to a single assistant affordance.

#### Scenario: Composer hides repo-only controls
- **WHEN** the composer is shown with no project selected
- **THEN** the worktree/local control and the plan/agent toggle are hidden
- **AND** the model/provider selector and send action remain available only for runtimes with supported assistant enforcement
- **AND** a static assistant indicator is shown in place of mode toggles

### Requirement: Quick Chat Handles Uploaded Files Without A Project
A quick chat SHALL read uploaded file attachments from context and let the user save assistant output as a file, without requiring a project.

#### Scenario: Rewrite an uploaded file
- **WHEN** the user uploads a file to a quick chat and asks to modify its content
- **THEN** the assistant reads the uploaded content and returns the modified version
- **AND** the user can save or download the result as a file through an explicit user action

#### Scenario: Operation needs real file tooling
- **WHEN** the requested operation requires multi-step changes to real files on disk
- **THEN** the system offers to attach a folder rather than performing host filesystem operations in the quick chat

### Requirement: In-Place Upgrade To A Project Workspace
A quick chat SHALL be upgradable in place into a project workspace by attaching a folder, preserving prior conversation history.

#### Scenario: Attach a folder to a quick chat
- **WHEN** the user attaches a folder to a quick chat from the composer
- **THEN** the chat becomes associated with that project (optionally with a worktree)
- **AND** prior assistant messages remain visible as conversation history
- **AND** subsequent turns run through project-backed preflight with the project working directory and plan/agent permissions
- **AND** the chat moves from the quick-chat group into that project's group in navigation

#### Scenario: Attach uses a fresh project-backed runtime session
- **WHEN** a quick chat is upgraded to a project workspace
- **THEN** the old folderless assistant session is cleared or ignored by default
- **AND** the next runtime turn starts from a fresh project-backed session unless a dedicated end-to-end test proves safe cross-cwd resume for the selected runtime

### Requirement: Quick Chat Surface Scope
Folderless quick chats SHALL be excluded from repository-centric surfaces and included in search.

#### Scenario: Quick chat is not listed in repository surfaces
- **WHEN** the workbench, kanban, terminal, diff, PR, worktree, or project MCP surface is shown
- **THEN** folderless quick chats are not listed or offered as eligible repository workspaces

#### Scenario: Quick chat is searchable
- **WHEN** the user searches chats
- **THEN** folderless quick chats are included in the results

### Requirement: Quick Chat Details Inspector Scope
If a Details inspector is shown for a folderless quick chat, it SHALL be limited to runtime-relevant, non-repository widgets, consistent with the quick-chat surface scope.

#### Scenario: Only runtime-relevant widgets in a quick chat Details inspector
- **WHEN** a Details inspector is shown for a folderless quick chat
- **THEN** only runtime-relevant non-repository widgets (such as usage, trace, and error) are allowed
- **AND** repository surfaces (info, diff, terminal, mcp, plan, browser, file) are not shown

#### Scenario: Quick chat Details is optional
- **WHEN** a folderless quick chat is active
- **THEN** this scope does not by itself require showing a Details inspector
- **AND** it only constrains the content if one is shown

