## ADDED Requirements

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
The system SHALL require explicit user action before installing or updating registry-managed skills.

#### Scenario: Update check finds newer skill
- **WHEN** a registry update check finds a newer skill version
- **THEN** the app shows the update as available
- **AND** the app does not modify the installed skill until the user chooses Update

#### Scenario: User installs bundled skill
- **WHEN** the user chooses Install for a bundled registry skill
- **THEN** the app installs the skill into the global skills directory
- **AND** records installed state including registry id, version, and content hash

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
The system SHALL distinguish skill sources in the Skills UI.

#### Scenario: User views Skills settings
- **WHEN** the user opens the Skills settings tab
- **THEN** each skill shows whether it comes from User, Project, Plugin, or Registry
- **AND** registry-managed skills show install/update status when available
