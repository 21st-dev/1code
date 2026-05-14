## ADDED Requirements

### Requirement: Secure Claude-Compatible Provider Configuration
The system SHALL store custom Claude-compatible provider tokens in main-process secure storage rather than renderer localStorage.

#### Scenario: User saves a custom provider token
- **WHEN** the user enters a model, base URL, token, and auth mode
- **THEN** the token is encrypted through Electron `safeStorage` before persistence
- **AND** renderer localStorage does not retain the raw token

#### Scenario: User clears provider settings
- **WHEN** the user resets custom Claude provider settings
- **THEN** the stored encrypted token and provider metadata are removed
- **AND** Claude chats fall back to OAuth or shell environment configuration

### Requirement: Anthropic Environment Variable Compatibility
The system SHALL allow a custom Claude-compatible provider token to be exported as either `ANTHROPIC_API_KEY` or `ANTHROPIC_AUTH_TOKEN`.

#### Scenario: API key mode
- **WHEN** a saved provider config uses `api_key` auth mode
- **THEN** Claude runtime environment includes `ANTHROPIC_API_KEY` with the decrypted token
- **AND** it includes `ANTHROPIC_BASE_URL` when a base URL is configured
- **AND** it does not set `ANTHROPIC_AUTH_TOKEN` from that provider token

#### Scenario: Auth token mode
- **WHEN** a saved provider config uses `auth_token` auth mode
- **THEN** Claude runtime environment includes `ANTHROPIC_AUTH_TOKEN` with the decrypted token
- **AND** it includes `ANTHROPIC_BASE_URL` when a base URL is configured
- **AND** it does not set `ANTHROPIC_API_KEY` from that provider token

### Requirement: Secret Redaction
The system SHALL avoid logging custom provider tokens or token prefixes.

#### Scenario: Debug logging is enabled
- **WHEN** Claude runtime environment debug logging runs
- **THEN** logs may show whether API key or auth token is present
- **AND** logs must not include the token value, prefix, suffix, or slice

### Requirement: Real Agent Smoke Test
The system SHALL have a documented smoke-test path for verifying local agent use without forced desktop login.

#### Scenario: Logged-out local agent use
- **WHEN** the app launches with no desktop login
- **AND** the user selects a local repository
- **AND** the user configures Claude or Codex credentials
- **AND** the user sends a simple read-only task
- **THEN** the agent reads the project and returns a result without requiring desktop login
