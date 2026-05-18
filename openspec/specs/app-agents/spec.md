# app-agents Specification

## Purpose
Define local application-level agent profiles, including import, edit, validation, and registry-backed discovery behavior.
## Requirements
### Requirement: Local App Agent Profiles
The system SHALL let users manage application-level agent profiles stored locally by the app, independent of runtime-specific file formats.

#### Scenario: Create app agent
- **WHEN** the user creates an App Agent with a valid name, description, and prompt
- **THEN** the system stores it locally with a unique kebab-case name
- **AND** the profile is available in the App Agents list.

#### Scenario: Update app agent
- **WHEN** the user edits an existing App Agent
- **THEN** the system persists the new description, prompt, and tool guidance locally.

#### Scenario: Delete app agent
- **WHEN** the user deletes an App Agent
- **THEN** the profile is removed from the local app database.

### Requirement: App Agent Mentions
The system SHALL expose App Agents through the existing `@agent` mention flow.

#### Scenario: Mention app agent
- **WHEN** the user opens the mention menu and selects an App Agent
- **THEN** the editor inserts an `@[agent:name]` mention token for that profile.

#### Scenario: Recommend app agent
- **WHEN** the draft text matches an App Agent name, description, or tool guidance
- **THEN** the context recommendation row may suggest that App Agent.

### Requirement: Runtime-Neutral Prompt Application
The system SHALL apply selected App Agent profiles to chat requests without requiring users to choose a runtime-specific agent type.

#### Scenario: Send request with app agent mention
- **WHEN** the user sends a chat request containing one or more `@[agent:name]` mentions
- **THEN** the system resolves those App Agents from local storage
- **AND** prepends their instructions as App Agent context before the user request.

#### Scenario: Missing app agent mention
- **WHEN** a chat request references an App Agent that no longer exists
- **THEN** the system keeps the request sendable and includes a clear missing-profile note in the injected context.

### Requirement: App Agent Registry Browse And Import
The system SHALL provide a curated App Agent registry browser that lets users inspect and import external agent definitions into local App Agents.

#### Scenario: Browse curated app agents
- **WHEN** the user opens the App Agents registry browser
- **THEN** the system lists agent definitions from curated sources with source and category context.

#### Scenario: Preview registry app agent
- **WHEN** the user selects a registry App Agent
- **THEN** the system loads its description, prompt, and tool guidance for review before import.

#### Scenario: Return to installed app agents
- **WHEN** the user is browsing the App Agent registry
- **THEN** the system provides a visible control to return to the installed App Agents list.

#### Scenario: Import registry app agent
- **WHEN** the user imports a registry App Agent
- **THEN** the system stores it as a local App Agent
- **AND** existing local App Agents with the same normalized name are updated instead of creating duplicates.
