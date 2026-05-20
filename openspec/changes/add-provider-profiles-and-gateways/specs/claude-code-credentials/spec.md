## MODIFIED Requirements

### Requirement: Claude Code Runtime Invocation
The system SHALL invoke Claude Code using the explicitly selected Claude source for the run.

#### Scenario: Claude Code OAuth is selected
- **WHEN** a user sends a Claude Code agent message
- **AND** the selected Claude source is `claude-oauth`
- **AND** a valid local Claude Code credential exists
- **THEN** the main process passes the valid access token to the Claude Code runtime environment
- **AND** saved provider profiles or legacy custom provider configuration do not override the OAuth run
- **AND** the renderer does not pass a raw credential in the chat request

#### Scenario: Provider profile is selected
- **WHEN** a user sends a Claude Code agent message
- **AND** the selected Claude source is a provider profile
- **THEN** the main process routes the run through the local provider gateway
- **AND** local Claude Code subscription credentials are not injected into that provider-profile run

#### Scenario: Legacy custom provider source is selected
- **WHEN** a legacy `custom-provider` source is selected
- **AND** a migrated legacy provider profile exists
- **THEN** the app resolves the run to that provider profile
- **AND** does not treat the mere existence of that profile as the default for unrelated Claude OAuth runs
