## MODIFIED Requirements

### Requirement: Explicit Skill Installation

The system SHALL require explicit user action before installing or updating
registry-managed skills, and SHALL allow the user to choose Claude Code, Codex,
or both as runtime targets when a registry skill supports multiple runtimes. The
Locus registry-managed install record SHALL be the canonical install truth;
runtime skill directories SHALL be projection targets for runtime availability.

#### Scenario: Update check finds newer skill
- **WHEN** a registry update check finds a newer skill version
- **THEN** the app shows the update as available for the affected runtime
- **AND** the app does not modify the installed skill until the user chooses Update for that runtime

#### Scenario: User installs bundled skill for Claude Code
- **WHEN** the user chooses Install for Claude for a bundled registry skill
- **THEN** the app records a Locus-managed skill install with registry id, version, content hash, and Claude runtime eligibility
- **AND** the Claude runtime remains eligible to materialize the skill into Claude's expected skill discovery location
- **AND** the UI reports Claude availability separately from Locus install state

#### Scenario: User installs bundled skill for Codex
- **WHEN** the user chooses Install for Codex for a bundled registry skill
- **THEN** the app records a Locus-managed skill install with registry id, version, content hash, and Codex runtime eligibility
- **AND** managed Codex app-server runs project the skill into the isolated `CODEX_HOME/skills` used for that run
- **AND** the UI reports Codex availability separately from Locus install state

#### Scenario: User installs bundled skill for both runtimes
- **WHEN** the user chooses Install for Both for a bundled registry skill
- **THEN** the app records one Locus-managed skill package record with independent runtime projection state for Claude and Codex
- **AND** each runtime records independent projection metadata and backup or rollback metadata where applicable

### Requirement: Source Labels

The system SHALL distinguish skill sources, Locus install state, and runtime
availability in the Skills UI.

#### Scenario: User views Skills settings
- **WHEN** the user opens the Skills settings tab
- **THEN** each skill shows whether it comes from User, Project, Plugin, or Registry
- **AND** registry-managed skills show Locus install/update/modified status when available
- **AND** registry-managed skills show Claude and Codex availability separately
- **AND** unavailable runtime states include a non-secret reason and remediation hint

## ADDED Requirements

### Requirement: Codex Isolated Skill Projection

Registry-managed Codex skills SHALL be projected into managed Codex isolated
homes without exposing unmanaged global Codex skills by default.

#### Scenario: Managed Codex run prepares isolated CODEX_HOME
- **WHEN** a managed Codex app-server run prepares its isolated `CODEX_HOME`
- **AND** a registry-managed skill is installed and eligible for Codex
- **THEN** the skill is staged or symlinked into the isolated `CODEX_HOME/skills`
- **AND** the projection record can report the skill as available for that run

#### Scenario: Global Codex skill is unmanaged
- **WHEN** a skill exists in the user's global Codex skills directory without Locus-managed registry metadata
- **THEN** managed Codex isolated homes do not receive that skill by default
- **AND** the UI does not report it as a registry-managed available skill
