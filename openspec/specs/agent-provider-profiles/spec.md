# agent-provider-profiles Specification

## Purpose
TBD - created by archiving change add-provider-profiles-and-gateways. Update Purpose after archive.
## Requirements
### Requirement: Provider Profile Storage
The system SHALL store reusable provider profiles with encrypted tokens and renderer-safe metadata.

#### Scenario: User saves a profile
- **WHEN** the user saves a provider profile with an API token
- **THEN** the token is encrypted in main-process storage
- **AND** profile list responses omit the plaintext token
- **AND** metadata includes protocol, base URL, default model, target runtimes, capabilities, and last test status

#### Scenario: User saves a local no-auth profile
- **WHEN** the user saves a local endpoint profile with `none` auth mode
- **THEN** the system stores the profile without requiring a token
- **AND** still restricts runtime use to main-process routing

### Requirement: Provider Presets
The system SHALL provide editable presets for China-hosted, generic, and local OpenAI-compatible providers.

#### Scenario: User creates a preset-based profile
- **WHEN** the user selects a provider preset
- **THEN** the app pre-fills protocol, base URL, default model, target runtimes, and capability hints
- **AND** the user can edit those values before saving

### Requirement: Explicit Provider Defaults
The system SHALL allow users to bind provider profiles as explicit defaults for supported purposes without overriding first-party auth implicitly.

#### Scenario: Claude custom profile exists
- **WHEN** a Claude-compatible provider profile exists
- **AND** the user has not selected it for a run or default binding
- **THEN** Claude Code OAuth remains the default Claude source

#### Scenario: User sets a helper default
- **WHEN** the user sets a profile as the default for sub-chat titles or commit messages
- **THEN** that helper uses the selected profile if its capability test allows helper text generation
- **AND** deterministic or local fallbacks remain available when the provider fails

### Requirement: Local Provider Gateway
The system SHALL route third-party runtime requests through a main-process local gateway with per-process authentication.

#### Scenario: Runtime uses a provider profile
- **WHEN** Claude or Codex starts a run using a provider profile
- **THEN** the runtime receives only a loopback gateway URL and a process-local gateway token
- **AND** the gateway injects the stored provider credential only when forwarding to the upstream provider

#### Scenario: Gateway receives an unauthenticated request
- **WHEN** a request to the local gateway omits or mismatches the gateway token
- **THEN** the gateway rejects the request
- **AND** the rejection does not reveal upstream credentials or profile secrets

### Requirement: Protocol Compatibility
The system SHALL support native Anthropic Messages, OpenAI Chat Completions, and OpenAI Responses-compatible profile protocols.

#### Scenario: Claude uses an OpenAI Chat-compatible profile
- **WHEN** a Claude provider-profile run targets an OpenAI Chat-compatible profile
- **THEN** the gateway adapts Anthropic Messages-shaped requests to Chat Completions requests
- **AND** streams or returns assistant text in the shape expected by the Claude runtime

#### Scenario: Codex uses a Chat Completions-only profile
- **WHEN** a Codex provider-profile run targets a Chat Completions-only profile
- **THEN** Codex is configured to call the local gateway as a Responses-compatible provider
- **AND** the gateway adapts Responses requests to Chat Completions requests where possible

### Requirement: Capability Testing
The system SHALL test provider profiles before enabling unsupported runtime targets.

#### Scenario: Profile test succeeds
- **WHEN** the user runs a provider test
- **AND** the provider returns a compatible response
- **THEN** the app records capability status for supported runtime targets
- **AND** enables only compatible profile choices in run selectors

#### Scenario: Profile test fails
- **WHEN** the provider test fails because of auth, network, model, or protocol incompatibility
- **THEN** the app records a sanitized failure status
- **AND** does not silently select that profile for unsupported runs

