# claude-code-credentials Specification

## Purpose
Define the local Claude Code credential import, login, refresh, and runtime invocation behavior for Locus so Claude Code subscription usage works without hosted 21st authentication in local-only mode.
## Requirements
### Requirement: Local Claude Code Credential Import
The system SHALL allow users to import existing Claude Code credentials from local system credential stores or Claude credential files without using hosted 21st authentication.

#### Scenario: Complete credentials are available locally
- **WHEN** local Claude Code credentials include an access token and refresh token
- **AND** the user chooses to import existing credentials
- **THEN** the app stores the credential payload in main-process secure storage
- **AND** the renderer does not receive or persist the raw access token or refresh token
- **AND** the app marks Claude Code as connected

#### Scenario: No local credentials are available
- **WHEN** the user chooses to import existing credentials
- **AND** the system credential store and Claude credential files do not contain Claude Code credentials
- **THEN** the app reports that no local Claude Code credentials were found
- **AND** it does not start hosted 21st authentication while local-only mode is enabled

### Requirement: Local Claude Code Browser Login
The system SHALL allow users to start Claude Code's official local CLI login from the app without using hosted 21st authentication.

#### Scenario: User starts local Claude Code login
- **WHEN** local-only mode is enabled
- **AND** the user chooses to connect Claude Code
- **THEN** the app starts the bundled Claude Code CLI with the official login command
- **AND** exposes the official Anthropic login URL when the CLI prints one
- **AND** does not request hosted 21st auth, hosted sandbox status, or hosted desktop auth endpoints

#### Scenario: Local CLI login succeeds
- **WHEN** the bundled Claude Code CLI exits successfully after browser login
- **THEN** the app imports the resulting local Claude Code credentials from system credential stores or Claude credential files
- **AND** stores them as the same encrypted refreshable credential envelope used by manual local import
- **AND** marks Claude Code as connected without exposing raw tokens to the renderer

#### Scenario: Local CLI login is cancelled or fails
- **WHEN** the user cancels local Claude Code login
- **OR** the bundled Claude Code CLI exits with an error
- **THEN** the app stops the local login session
- **AND** shows a retryable local-login error
- **AND** does not fall back to hosted 21st authentication while local-only mode is enabled

### Requirement: Refreshable Claude Code Credential Storage
The system SHALL store Claude Code credentials as a versioned encrypted payload that can include refresh token, expiry, scopes, source, and update timestamps.

#### Scenario: New credential is imported
- **WHEN** a local Claude Code credential is imported
- **THEN** the encrypted stored payload includes the access token
- **AND** it includes the refresh token when one is available
- **AND** it includes expiry and scope metadata when available
- **AND** logs only indicate token presence and metadata, not token values

#### Scenario: Legacy token row exists
- **WHEN** an existing encrypted stored credential is a legacy plain access token string
- **THEN** the app can still read it as a non-refreshable Claude Code credential
- **AND** the UI identifies that credential as non-refreshable
- **AND** the user can replace it by importing complete local credentials

### Requirement: Runtime Token Refresh
The system SHALL refresh expiring Claude Code access tokens before starting a Claude Code agent run when a refresh token is available.

#### Scenario: Token expires soon
- **WHEN** the active Claude Code credential has an `expiresAt` value within the refresh buffer
- **AND** a refresh token is available
- **THEN** the app refreshes the access token through Anthropic's token endpoint
- **AND** persists the refreshed credential payload before invoking Claude Code
- **AND** passes only the valid access token to the Claude Code runtime environment

#### Scenario: Refresh fails
- **WHEN** the active Claude Code credential is expired or expiring
- **AND** token refresh fails
- **THEN** the agent run does not start with a known-expired token
- **AND** the UI reports that Claude Code credentials need to be reconnected or re-imported
- **AND** the app does not fall back to hosted 21st authentication in local-only mode

### Requirement: Local-Only Hosted Auth Boundary
The system SHALL keep Claude Code local credential import and runtime separate from hosted 21st authentication.

#### Scenario: Local-only mode is enabled
- **WHEN** the user opens Claude Code onboarding or an auth retry modal
- **THEN** local credential import is available
- **AND** hosted sandbox OAuth is blocked or hidden
- **AND** no request is sent to hosted 21st auth, sandbox status, or hosted desktop auth endpoints

#### Scenario: Hosted/internal mode is explicitly enabled
- **WHEN** local-only mode is explicitly disabled for development or internal builds
- **THEN** hosted sandbox OAuth may remain available behind existing auth and guard checks
- **AND** local credential import remains available as an alternative

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
