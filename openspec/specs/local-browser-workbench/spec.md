# local-browser-workbench Specification

## Purpose
TBD - created by archiving change add-local-browser-workbench. Update Purpose after archive.
## Requirements
### Requirement: Local Preview Boundary
The system SHALL only load local preview targets in the Local Browser Workbench.

#### Scenario: User opens a localhost page
- **WHEN** the user enters `localhost`, `127.0.0.1`, `[::1]`, or an allowed `file://` URL
- **THEN** the workbench normalizes the URL
- **AND** loads it in the controlled preview

#### Scenario: User enters a remote URL
- **WHEN** the user enters a non-local HTTP or HTTPS URL
- **THEN** the workbench blocks navigation
- **AND** displays a clear local-only reason

#### Scenario: Preview attempts remote navigation
- **WHEN** the loaded page attempts to navigate to a target outside the local boundary
- **THEN** the workbench prevents or immediately rolls back the navigation
- **AND** records the blocked URL as a diagnostic

### Requirement: Embedded Local Browser Preview
The system SHALL provide an in-app browser panel for inspecting local pages.

#### Scenario: User opens the workbench
- **WHEN** a workspace has a local worktree
- **THEN** the user can open a resizable browser workbench panel from the agent workspace

#### Scenario: User reloads a page after edits
- **WHEN** the user clicks reload
- **THEN** the workbench reloads the current local URL
- **AND** preserves the URL for repeat smoke checks

#### Scenario: User changes viewport
- **WHEN** the user switches between desktop and mobile viewport controls
- **THEN** the preview uses the selected viewport dimensions without changing the loaded URL

### Requirement: Browser Diagnostics Capture
The system SHALL capture bounded local page diagnostics from the preview.

#### Scenario: Console errors occur
- **WHEN** the preview emits console errors or warnings
- **THEN** the workbench records recent messages with level and text
- **AND** bounds the retained list

#### Scenario: Network or load failure occurs
- **WHEN** the preview reports a load failure
- **THEN** the workbench records the failed URL and reason
- **AND** displays the failure in diagnostics

#### Scenario: User captures page context
- **WHEN** the user clicks capture diagnostics
- **THEN** the workbench captures a screenshot if available
- **AND** captures a bounded DOM summary
- **AND** stores the capture in local renderer state for review

### Requirement: Agent Context Handoff
The system SHALL let users send browser QA context to the active agent input.

#### Scenario: User adds annotation
- **WHEN** the user writes a note or selects page context in the workbench
- **THEN** the note or selected element summary is included in the browser QA report

#### Scenario: User inserts report into chat
- **WHEN** the user chooses to send browser context to the agent
- **THEN** the app inserts a bounded browser QA report into the active chat input
- **AND** does not automatically send the message without user action

#### Scenario: Screenshot is captured
- **WHEN** a screenshot capture succeeds
- **THEN** the report indicates screenshot availability
- **AND** the workbench keeps the screenshot visible locally for visual inspection

