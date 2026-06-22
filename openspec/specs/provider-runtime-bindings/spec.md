# provider-runtime-bindings Specification

## Purpose
TBD - created by archiving change expand-provider-runtime-bindings. Update Purpose after archive.
## Requirements
### Requirement: Main-Process Provider Binding
The system SHALL resolve provider-profile runtime bindings in the Electron main
process before starting Claude, Codex, or helper runtime work.

#### Scenario: Runtime uses a provider profile
- **WHEN** the renderer starts a run with a provider profile selected
- **THEN** the renderer sends only a provider profile ID or provider-profile
  model source
- **AND** the main process resolves the profile, stored credential, and gateway
  endpoint before runtime startup
- **AND** plaintext upstream provider secrets are not returned to the renderer

#### Scenario: Unsupported runtime target
- **WHEN** a selected provider profile does not target the requested runtime
- **THEN** the runtime start fails before provider work begins
- **AND** the user-visible error identifies the unsupported runtime target
- **AND** the error omits provider secrets and gateway tokens

### Requirement: Per-Run Gateway Routing
The system SHALL route provider-profile runtime requests through a Locus-owned
loopback gateway instead of mutating external CLI configuration during normal
runs.

#### Scenario: Codex provider-profile run starts
- **WHEN** Codex starts with a provider profile
- **THEN** Codex receives per-run app-server config overrides for the Locus provider
  gateway
- **AND** the process environment contains the gateway token only under a
  Locus-owned variable
- **AND** inherited `CODEX_API_KEY` and `OPENAI_API_KEY` values are removed from
  the Codex provider process environment
- **AND** unrelated provider/API token env vars are not inherited by the Codex
  provider process
- **AND** `~/.codex/config.toml` and `~/.codex/auth.json` are not written as part
  of the normal run

#### Scenario: Claude provider-profile run starts
- **WHEN** Claude starts with a supported provider profile
- **THEN** Claude receives a loopback Anthropic-compatible gateway URL and
  process-local gateway auth token
- **AND** the gateway injects the stored upstream credential only when forwarding
  the request from the main process
- **AND** `~/.claude/settings.json` is not written as part of the normal run

### Requirement: Non-Secret Runtime Metadata
The system SHALL expose runtime binding status and metadata without exposing
provider credentials.

#### Scenario: Runtime binding status is displayed or logged
- **WHEN** a runtime binding is shown in the UI, stored in chat metadata, emitted
  as a runtime status, or written to logs
- **THEN** the data may include runtime, provider profile ID or name, model,
  capability status, source, and redacted config preview
- **AND** the data MUST NOT include upstream provider tokens, gateway tokens,
  OAuth tokens, resolved secret headers, or raw secret-bearing env values

### Requirement: Secret-Bearing Header Rejection
The system SHALL prevent provider credentials from being stored in plaintext
custom provider headers.

#### Scenario: User saves a custom secret header
- **WHEN** a provider profile save payload contains an authentication-like,
  token-like, or unrecognized custom header
- **THEN** the save is rejected or the unsafe header is scrubbed before storage
- **AND** the plaintext header value is not stored in SQLite
- **AND** renderer metadata continues to expose only redacted header presence for
  safe metadata headers

### Requirement: Profile-Scoped Gateway Tokens
The system SHALL scope local provider gateway tokens to the provider profile and
gateway kind for which they were issued.

#### Scenario: Gateway token is used for another profile
- **WHEN** a gateway token issued for profile A is presented to profile B
- **THEN** the gateway rejects the request
- **AND** the rejection does not reveal upstream provider credentials, gateway
  tokens, or profile secrets

### Requirement: No Plaintext Legacy Runtime Tokens
The system SHALL reject plaintext provider tokens in runtime chat APIs after the
legacy migration boundary.

#### Scenario: Renderer sends a plaintext Claude custom config token
- **WHEN** the Claude chat runtime API receives a plaintext custom provider token
- **THEN** the run is rejected before runtime startup
- **AND** the user is directed to save the provider through the secure provider
  profile or legacy migration path
- **AND** the token is not logged or persisted

#### Scenario: Legacy renderer migration fails
- **WHEN** a legacy renderer-stored Claude provider token is found
- **AND** secure main-process storage cannot save it
- **THEN** the renderer clears the legacy plaintext token after the migration
  attempt
- **AND** the user is prompted to save the provider again through the secure path

### Requirement: Codex App-Server Provider Binding
The system SHALL preserve main-process provider-profile binding when Codex desktop/chat runs through app-server.

#### Scenario: App-server uses a provider profile
- **WHEN** a Codex desktop/chat run starts through app-server with a selected provider profile
- **THEN** the renderer sends only the provider profile ID or renderer-safe model source
- **AND** the main process resolves the profile, local gateway URL, and process-local gateway token
- **AND** upstream provider credentials are injected only by the main-process gateway
- **AND** plaintext upstream credentials are not sent to the renderer, app-server client payloads, logs, diagnostics, or persisted run metadata

#### Scenario: App-server cannot bind the selected profile
- **WHEN** the app-server adapter cannot safely route the profile through the Locus gateway
- **THEN** the run fails before provider work starts or falls back according to explicit policy
- **AND** inherited `CODEX_API_KEY`, `OPENAI_API_KEY`, and unrelated provider tokens are not allowed to override the selected secure profile silently
- **AND** the user-visible diagnostic identifies the unsupported binding without exposing secrets

### Requirement: Codex App-Server Secret Boundary
The system SHALL reject secret-bearing renderer input and build app-server runtime environments from explicit allowlists.

#### Scenario: Renderer sends raw secrets for an app-server Codex run
- **WHEN** a renderer, protocol, job, or CLI request for a Codex app-server run includes raw API keys, OAuth tokens, gateway tokens, custom env, authorization headers, or secret-bearing provider config
- **THEN** the request is rejected before runtime startup
- **AND** the rejected values are not logged, persisted, or echoed in diagnostics

#### Scenario: Host environment contains stale provider tokens
- **WHEN** the host process environment contains `OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, gateway tokens, or other provider-like secrets
- **AND** a Codex app-server run starts with a selected provider profile or app-managed auth mode
- **THEN** the app-server runtime receives only an explicit allowlisted environment
- **AND** stale host secrets cannot silently override the selected provider profile or appear in runtime events, logs, or diagnostics

