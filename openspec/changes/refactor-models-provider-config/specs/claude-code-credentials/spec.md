## MODIFIED Requirements

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
