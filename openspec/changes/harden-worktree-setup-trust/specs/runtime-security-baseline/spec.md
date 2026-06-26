## ADDED Requirements
### Requirement: Repository Worktree Setup Requires Explicit Trust
The system SHALL NOT execute repository-provided worktree setup commands until the user has explicitly approved the exact setup command fingerprint for that project.

#### Scenario: Worktree setup config is first detected
- **WHEN** a project worktree is created and a setup command exists in `.locus/worktree.json`, `.cursor/worktrees.json`, or `.1code/worktree.json`
- **THEN** the main process SHALL NOT execute the setup command
- **AND** the renderer SHALL show the config source, config path, and original command list for user review.

#### Scenario: User approves setup commands
- **WHEN** the user approves the displayed setup command list for the project
- **THEN** the main process SHALL remember the approval by project and setup command fingerprint
- **AND** only then MAY execute the approved command list in the worktree.

#### Scenario: Setup commands change after approval
- **WHEN** the setup config source, config path, platform, or command list changes after approval
- **THEN** the setup command fingerprint SHALL change
- **AND** the main process SHALL require fresh user approval before executing the changed commands.
