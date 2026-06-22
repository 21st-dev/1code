## MODIFIED Requirements
### Requirement: Desktop Runtime Preflight
The runtime core SHALL verify desktop run context before provider, MCP, attachment, or runtime adapter work starts, including project-backed, removed project history, and folderless quick-chat contexts.

#### Scenario: Project-backed desktop run context is verified
- **WHEN** a desktop Claude or Codex run is requested for a project-backed chat
- **AND** the associated project is active
- **THEN** the runtime core canonicalizes and verifies project, chat, sub-chat,
  cwd, runtime, mode, provider profile reference, MCP readiness, attachment
  readiness, and local-only constraints
- **AND** the verified result contains only renderer-safe metadata needed by
  downstream runtime setup
- **AND** provider work does not start from raw renderer `cwd`, provider config,
  MCP config, or attachment references

#### Scenario: Removed project history cannot start a project runtime
- **WHEN** a desktop Claude or Codex run is requested for a chat whose associated
  project has been removed from the active Projects list
- **THEN** the runtime core rejects or blocks the run before provider work starts
- **AND** the diagnostic tells the renderer that the project must be restored
  before project workflows can resume
- **AND** the diagnostic is renderer-safe and does not include provider secrets,
  OAuth tokens, gateway tokens, raw headers, or secret-bearing env values

#### Scenario: Folderless quick-chat context is verified
- **WHEN** a desktop Claude or Codex run is requested for a chat with no associated
  project
- **THEN** the runtime core verifies chat/sub-chat ownership, runtime, provider
  profile reference, attachment readiness, and local-only constraints
- **AND** the verified result identifies the context as folderless with `project`
  absent or null
- **AND** the working directory is a main-process-owned app scratch directory
  rather than a renderer-supplied project path
- **AND** project MCP, project context, worktree, diff, terminal, PR, and
  guarded-scope workspace features are skipped or unavailable before provider
  startup

#### Scenario: Preflight blocks unsafe request
- **WHEN** the request contains an unregistered cwd, removed project, mismatched
  project/chat/sub-chat, unsupported attachment, provider profile blocker, MCP
  needs-auth blocker, local-only violation, or folderless chat carrying
  project/worktree/PR state
- **THEN** the runtime core rejects or blocks the run before provider work starts
- **AND** the diagnostic is renderer-safe and does not include provider secrets,
  OAuth tokens, gateway tokens, raw headers, or secret-bearing env values
