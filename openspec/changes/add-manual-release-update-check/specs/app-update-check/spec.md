## ADDED Requirements

### Requirement: Manual GitHub Release Check
The system SHALL provide a manual update check for Locus releases without automatic download or installation.

#### Scenario: User checks for updates
- **WHEN** the user clicks "Check for updates" from Settings > About
- **THEN** the app requests the fork-owned GitHub Releases latest endpoint
- **AND** compares the latest release tag with the installed app version
- **AND** displays whether a newer version is available

#### Scenario: User opens release page
- **WHEN** an update check result includes a GitHub Release URL
- **THEN** the user can open that release page in the system browser
- **AND** any download or installation remains manual outside the app

#### Scenario: No release has been published
- **WHEN** the fork-owned GitHub Releases latest endpoint reports no latest release
- **THEN** the app displays that no GitHub Release has been published yet
- **AND** the app links to the repository releases page without treating the result as an updater failure

### Requirement: No Automatic Update Installation
The system SHALL NOT auto-download, auto-install, or silently apply app updates as part of the manual release check.

#### Scenario: App starts
- **WHEN** Locus starts
- **THEN** it does not automatically check GitHub Releases for app updates
- **AND** it does not initialize `electron-updater` or a hosted updater feed

#### Scenario: Manual check completes
- **WHEN** the manual check finds a newer release
- **THEN** the app shows a notification or settings result
- **AND** it does not download release assets automatically

### Requirement: Minimal Update Check Data
The system SHALL avoid sending local project, chat, file, provider, or credential information during update checks.

#### Scenario: Release endpoint request runs
- **WHEN** the manual update check requests the GitHub Releases latest endpoint
- **THEN** the request includes only normal HTTP metadata needed to fetch the public release record
- **AND** it does not include local project paths, chat content, provider keys, or user credentials
