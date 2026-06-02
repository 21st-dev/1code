# agent-chat-commands Specification

## Purpose
TBD - created by archiving change add-project-init-slash-command. Update Purpose after archive.
## Requirements
### Requirement: Project Init Slash Command
The system SHALL provide a built-in `/init` chat slash command that initializes project instruction files for local coding agents.

#### Scenario: User selects init command
- **WHEN** the user selects `/init` from the chat slash command picker
- **THEN** the app treats it as a built-in Locus prompt command
- **AND** the sent prompt asks the agent to inspect existing project instruction files before writing
- **AND** the prompt preserves existing `AGENTS.md` and `CLAUDE.md` content unless a narrow update is clearly needed
- **AND** the prompt supports Claude Code and Codex conventions without implying it directly invokes either provider CLI slash command

### Requirement: Local Diagnostic Slash Commands
The system SHALL provide built-in read-only diagnostic slash commands for common local coding-agent workflows.

#### Scenario: User selects doctor command
- **WHEN** the user selects `/doctor` from the chat slash command picker
- **THEN** the app treats it as a built-in Locus prompt command
- **AND** the sent prompt asks the agent to inspect local project and agent-runtime health without modifying files
- **AND** the prompt covers project setup, git state, package scripts, local instruction files, Locus worktree config, and relevant Claude/Codex/MCP/plugin indicators where available
- **AND** it reports findings, likely causes, and recommended next actions

#### Scenario: User selects diff command
- **WHEN** the user selects `/diff` from the chat slash command picker
- **THEN** the app treats it as a built-in Locus prompt command
- **AND** the sent prompt asks the agent to summarize the current working tree without modifying files
- **AND** the prompt covers staged, unstaged, and untracked changes where available
- **AND** it calls out behavioral risks and suggested verification

### Requirement: Built-In Prompt Command Expansion
The system SHALL expand built-in prompt slash commands before sending them to the agent.

#### Scenario: User sends a built-in prompt command
- **WHEN** the user sends `/init`, `/doctor`, `/diff`, `/review`, `/commit`, `/worktree-setup`, or another built-in prompt command
- **THEN** the app replaces the slash command with the registered prompt text
- **AND** preserves any command arguments by appending them to the prompt context
- **AND** keeps local command file expansion behavior for non-built-in commands

