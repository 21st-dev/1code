# app-update-check Specification

## Purpose
Define packaged-app update checks for Locus through this fork's GitHub Releases feed while preserving user control over download and installation.

## Requirements
### Requirement: Automatic GitHub Release Check
The system SHALL provide packaged-app update checks for Locus releases through this fork's GitHub Releases feed while preserving user control over download and installation.

#### Scenario: Packaged app starts on a supported install target
- **WHEN** Locus starts as a packaged macOS app or Windows NSIS install
- **AND** automatic checks are enabled
- **THEN** the app checks this fork's GitHub Releases update feed after startup
- **AND** it compares the available release version with the installed app version
- **AND** it displays update status in Settings > About

#### Scenario: User checks for updates manually
- **WHEN** the user clicks "Check now" from Settings > About
- **THEN** the app requests this fork's GitHub Releases update feed
- **AND** it displays whether a newer version is available

#### Scenario: Unsupported update target
- **WHEN** Locus runs in development, Linux, or Windows portable mode
- **THEN** automatic update installation is disabled
- **AND** Settings > About keeps a GitHub Releases link for manual download

### Requirement: User-Controlled Update Installation
The system SHALL NOT silently download, install, or restart for app updates.

#### Scenario: Update is available
- **WHEN** the updater finds a newer release
- **THEN** the app shows an update-available state
- **AND** it waits for the user to click "Download update"

#### Scenario: Download completes
- **WHEN** the user-triggered update download completes
- **THEN** the app shows a restart-to-install action
- **AND** it waits for the user to click "Restart to install"

#### Scenario: User disables automatic checks
- **WHEN** the user disables automatic update checks in Settings > About
- **THEN** startup and focus-triggered checks stop
- **AND** manual "Check now" remains available on supported install targets

### Requirement: Minimal Update Check Data
The system SHALL avoid sending local project, chat, file, provider, or credential information during update checks.

#### Scenario: Update feed request runs
- **WHEN** an automatic or manual update check requests this fork's GitHub Releases update feed
- **THEN** the request includes only normal updater metadata needed to fetch public release records and artifacts
- **AND** it does not include local project paths, chat content, provider keys, or user credentials
