## MODIFIED Requirements

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
