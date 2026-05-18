## MODIFIED Requirements
### Requirement: Explicit Skill Installation
The system SHALL require explicit user action before installing or updating registry-managed skills, and SHALL allow the user to choose Claude Code, Codex, or both as install targets when a registry skill supports multiple runtimes.

#### Scenario: Update check finds newer skill
- **WHEN** a registry update check finds a newer skill version
- **THEN** the app shows the update as available for the affected runtime
- **AND** the app does not modify the installed skill until the user chooses Update for that runtime

#### Scenario: User installs bundled skill for Claude Code
- **WHEN** the user chooses Install for Claude for a bundled registry skill
- **THEN** the app installs the skill into the Claude global skills directory
- **AND** records Claude runtime installed state including registry id, version, and content hash

#### Scenario: User installs bundled skill for Codex
- **WHEN** the user chooses Install for Codex for a bundled registry skill
- **THEN** the app installs the skill into the Codex global skills directory
- **AND** records Codex runtime installed state including registry id, version, and content hash

#### Scenario: User installs bundled skill for both runtimes
- **WHEN** the user chooses Install for Both for a bundled registry skill
- **THEN** the app installs the skill into both Claude and Codex global skills directories
- **AND** each runtime records independent installed state and backup metadata

### Requirement: Source Labels
The system SHALL distinguish skill sources and runtime install targets in the Skills UI.

#### Scenario: User views Skills settings
- **WHEN** the user opens the Skills settings tab
- **THEN** each skill shows whether it comes from User, Project, Plugin, or Registry
- **AND** registry-managed skills show install/update status when available
- **AND** registry-managed skills show Claude and Codex runtime state separately
