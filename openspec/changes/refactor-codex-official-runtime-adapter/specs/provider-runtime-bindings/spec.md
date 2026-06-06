## ADDED Requirements

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
