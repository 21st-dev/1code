# skill-registry Specification

## Purpose
TBD - created by archiving change add-skill-registry-sync. Update Purpose after archive.
## Requirements
### Requirement: Registry Skill Catalog
The system SHALL provide a registry catalog for reusable global skills that is independent of a developer's local `~/.codex/skills` directory.

#### Scenario: Bundled catalog available in packaged app
- **WHEN** the app starts with no network access
- **THEN** it can still list the bundled registry skill catalog
- **AND** the catalog source is labeled as bundled or registry-managed

#### Scenario: Local Codex directory is absent
- **WHEN** `~/.codex/skills` does not exist
- **THEN** registry skill listing and bundled install still work

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

### Requirement: Verified Skill Packages
The system SHALL verify registry skill package integrity before installation.

#### Scenario: Package hash matches manifest
- **WHEN** a skill package hash matches the manifest SHA-256
- **THEN** the app may install the package after validating its layout

#### Scenario: Package hash mismatch
- **WHEN** a downloaded or bundled package hash does not match the manifest SHA-256
- **THEN** the app refuses to install the package
- **AND** reports an integrity error

### Requirement: User Skill Protection
The system SHALL protect user-owned and locally modified skills from silent overwrite.

#### Scenario: Registry-managed skill modified locally
- **WHEN** the installed skill content differs from the recorded installed hash
- **THEN** the app marks it as locally modified
- **AND** requires explicit user confirmation before replacing it

#### Scenario: User-created skill has same id as registry skill
- **WHEN** a user-created skill directory exists without registry installed-state metadata
- **THEN** the app does not treat it as registry-managed
- **AND** does not overwrite it during registry update

### Requirement: Source Labels
The system SHALL distinguish skill sources and runtime install targets in the Skills UI.

#### Scenario: User views Skills settings
- **WHEN** the user opens the Skills settings tab
- **THEN** each skill shows whether it comes from User, Project, Plugin, or Registry
- **AND** registry-managed skills show install/update status when available
- **AND** registry-managed skills show Claude and Codex runtime state separately

### Requirement: External Skill Collections
The system SHALL allow the bundled skill registry to list external skill collections that are browse-only and not treated as verified installable skill packages.

#### Scenario: User views an external collection
- **WHEN** the user opens Settings > Skills and browses the registry
- **THEN** the app may show external collections alongside installable registry skills
- **AND** each external collection shows its source link and install guidance
- **AND** the app does not show install, update, restore, or rollback actions for that collection
