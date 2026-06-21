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

The system SHALL store active Claude Code credentials as versioned encrypted
payloads in `anthropic_accounts`, selected by `anthropic_settings`, and SHALL
treat `claude_code_credentials` only as a one-time legacy migration source.

#### Scenario: New credential is imported

- **WHEN** a local Claude Code credential is imported, manually entered, or
  created by local Claude Code login
- **THEN** the encrypted stored payload includes the access token in
  `anthropic_accounts`
- **AND** it includes the refresh token when one is available
- **AND** it includes expiry and scope metadata when available
- **AND** `anthropic_settings.active_account_id` points at the imported account
- **AND** logs only indicate token presence and metadata, not token values
- **AND** the app does not mirror the credential into
  `claude_code_credentials.default`

#### Scenario: Imported local credential is stale

- **WHEN** the user imports an existing local Claude Code credential from the
  system credential store or Claude credential file
- **AND** the imported credential includes a refresh token
- **AND** refresh validation fails with `invalid_grant` or another stale-token
  response, regardless of the current access token expiry
- **THEN** the app does not mark the account as connected
- **AND** the app removes only the just-imported Locus `anthropic_accounts`
  record and active-account reference
- **AND** the app does not delete or mutate the user's system Keychain or Claude
  credential file entry
- **AND** the renderer receives reconnect guidance without raw token values

#### Scenario: Imported local credential is not refreshable

- **WHEN** the user imports an existing local Claude Code credential from the
  system credential store or Claude credential file
- **AND** the imported credential does not include a refresh token
- **AND** the access token is expired
- **THEN** the app does not mark the account as connected
- **AND** the renderer receives reconnect guidance without raw token values
- **AND** the app does not delete or mutate the user's system Keychain or Claude
  credential file entry

#### Scenario: User chooses fresh OAuth despite local credentials

- **WHEN** local system Claude Code credentials exist
- **AND** the user chooses to sign in again instead of importing them
- **THEN** the app starts the fresh Claude Code OAuth login flow
- **AND** it does not import the existing local credential first
- **AND** successful OAuth stores only the new canonical
  `anthropic_accounts` credential

#### Scenario: Legacy token row exists on upgrade

- **WHEN** `anthropic_accounts` has no rows
- **AND** `claude_code_credentials.default` contains an encrypted legacy Claude
  Code credential
- **THEN** the app migrates that credential into `anthropic_accounts`
- **AND** sets the migrated account as active in `anthropic_settings`
- **AND** clears `claude_code_credentials.default` after the migrated account is
  durably written
- **AND** the renderer sees the migrated account from `anthropic_accounts`, not
  a synthetic `legacy-default` account

#### Scenario: Canonical accounts already exist

- **WHEN** `anthropic_accounts` contains at least one account
- **AND** `claude_code_credentials.default` also contains a stale credential
- **THEN** account list, active account status, credential metadata, and runtime
  startup ignore the stale legacy row
- **AND** the stale row is cleared when the storage owner can do so safely
- **AND** no UI path presents the stale row as an account

#### Scenario: Legacy migration cannot complete

- **WHEN** a legacy credential exists
- **AND** the app cannot write the migrated account into `anthropic_accounts`
- **THEN** the app leaves the legacy row untouched
- **AND** does not use the legacy row as an active runtime credential
- **AND** reports that Claude Code credentials must be reconnected or imported

### Requirement: Runtime Token Refresh

The system SHALL resolve and refresh Claude Code access tokens only from the
active account in `anthropic_accounts` after legacy migration has run.

#### Scenario: Token expires soon

- **WHEN** the active Claude Code account has an `expiresAt` value within the
  refresh buffer
- **AND** a refresh token is available
- **THEN** the app refreshes the access token through Anthropic's token endpoint
- **AND** persists the refreshed credential payload to the active
  `anthropic_accounts` row before invoking Claude Code
- **AND** passes only the valid access token to the Claude Code runtime
  environment
- **AND** does not write the refreshed payload to
  `claude_code_credentials.default`

#### Scenario: Refresh fails

- **WHEN** the active Claude Code account is expired or expiring
- **AND** token refresh fails
- **THEN** the agent run does not start with a known-expired token
- **AND** the UI reports that Claude Code credentials need to be reconnected or
  re-imported
- **AND** if the failure is a stale-token response such as `invalid_grant`, the
  app stops presenting the active Locus account as healthy for future runs
- **AND** the app does not fall back to hosted 21st authentication in local-only
  mode
- **AND** the app does not fall back to `claude_code_credentials.default`

#### Scenario: No active canonical account exists after migration

- **WHEN** legacy migration has run
- **AND** `anthropic_settings.active_account_id` is empty or references a
  missing account
- **THEN** Claude Code runtime startup does not read
  `claude_code_credentials.default`
- **AND** the run is blocked with reconnect or import guidance

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

The system SHALL invoke Claude Code using the explicitly selected Claude source for
the run. Durable custom-provider runs SHALL use Provider Profiles; legacy
`custom-provider` state SHALL be normalized before runtime startup and MUST NOT
start from raw `claudeProviderConfig`.

#### Scenario: Claude Code OAuth is selected

- **WHEN** a user sends a Claude Code agent message
- **AND** the selected Claude source is `claude-oauth`
- **AND** a valid local Claude Code credential exists
- **THEN** the main process passes the valid access token to the Claude Code runtime
  environment
- **AND** saved provider profiles or legacy custom provider configuration do not
  override the OAuth run
- **AND** the renderer does not pass a raw credential in the chat request

#### Scenario: Provider profile is selected

- **WHEN** a user sends a Claude Code agent message
- **AND** the selected Claude source is a provider profile
- **THEN** the main process routes the run through the local provider gateway
- **AND** local Claude Code subscription credentials are not injected into that
  provider-profile run

#### Scenario: Legacy custom provider source is normalized to a profile

- **WHEN** a persisted chat, preference, or transient UI state still references the
  legacy `custom-provider` source
- **AND** the migrated `legacy-claude-provider` profile exists
- **THEN** the app normalizes the source to `provider-profile:legacy-claude-provider`
  through a shared source-normalization helper before runtime startup
- **AND** the main process routes the run through the local provider gateway
- **AND** runtime startup does not call raw `getActiveClaudeProviderConfig` as a
  fallback provider source

#### Scenario: Persisted sub-chat source is normalized at send time

- **WHEN** `ipc-chat-transport` reads a persisted sub-chat Claude source of
  `custom-provider`
- **THEN** it normalizes the source before building tRPC input
- **AND** it either sends a provider-profile source / `claude-oauth` to the main
  process or blocks before tRPC input is built with actionable setup guidance
- **AND** the request does not send raw `custom-provider`

#### Scenario: Legacy custom provider source has no migrated profile

- **WHEN** a persisted chat, preference, or transient UI state still references the
  legacy `custom-provider` source
- **AND** no migrated legacy provider profile is available
- **THEN** the app does not start a run using raw `claudeProviderConfig`
- **AND** it either falls back to `claude-oauth` when a valid credential exists or
  blocks with actionable guidance to configure a Provider Profile

