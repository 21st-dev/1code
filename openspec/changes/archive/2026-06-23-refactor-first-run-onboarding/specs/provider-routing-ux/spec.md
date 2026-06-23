## ADDED Requirements

### Requirement: First-Run Provider Paths Use Canonical Sources

The first-run onboarding provider paths SHALL use the same canonical provider
and account sources as the rest of the app, without adding a second custom
provider editor or renderer-secret path.

#### Scenario: User saves an Anthropic API key during first run

- **WHEN** the user submits an Anthropic API key from first-run onboarding
- **THEN** onboarding saves it as a Claude-targeted Provider Profile
- **AND** selects the saved provider-profile source for Claude runs
- **AND** it does not save `claudeProviderConfig`, persist `custom-provider`, or
  store the key in renderer localStorage

#### Scenario: User saves a custom or local Claude-compatible provider

- **WHEN** the user submits a custom Claude-compatible base URL, model, auth mode,
  and optional token from first-run onboarding
- **THEN** onboarding saves it as a Provider Profile with renderer-safe metadata
- **AND** `No auth` remains available only as an explicit auth mode for local
  providers or trusted proxies
- **AND** plaintext tokens, gateway tokens, custom secret headers, and raw
  diagnostics are not returned to the renderer after save

#### Scenario: User chooses Codex API-key setup

- **WHEN** the user saves an OpenAI API key for Codex during first run
- **THEN** onboarding uses the app-managed Codex API-key secure-storage path
- **AND** the renderer derives the Codex auth method and status from the
  secure-storage and integration owners rather than storing a completion flag
- **AND** Codex chat requests do not accept or transmit the raw key

#### Scenario: User connects first-party Claude or Codex account

- **WHEN** the user connects Claude Code or Codex through first-party account auth
- **THEN** onboarding records the existing account/auth source used by runtime
  startup
- **AND** Provider Profile rows remain separate provider choices rather than
  first-party account sources
