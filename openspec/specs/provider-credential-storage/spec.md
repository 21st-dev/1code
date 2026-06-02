# provider-credential-storage Specification

## Purpose
TBD - created by archiving change harden-provider-credential-storage. Update Purpose after archive.
## Requirements
### Requirement: Main-Process Provider Secret Ownership
The system SHALL keep newly saved provider runtime secrets in main-process secure storage and SHALL expose only non-secret metadata to the renderer.

#### Scenario: User saves a Codex API key
- **WHEN** the user saves a Codex API key through onboarding or settings
- **THEN** the renderer sends the plaintext key only for that explicit save operation
- **AND** the main process stores the key encrypted through Electron `safeStorage`
- **AND** subsequent renderer status reads only return whether a key exists and whether encryption is available
- **AND** the renderer does not persist the key in `localStorage`

#### Scenario: User removes a Codex API key
- **WHEN** the user removes the app-managed Codex API key
- **THEN** the main process deletes the stored encrypted key
- **AND** renderer status reads report that no app-managed Codex API key exists

### Requirement: Codex Runtime Secret Injection
The system SHALL inject app-managed Codex API keys into Codex runtime environment variables from the main process without accepting plaintext keys in chat requests.

#### Scenario: Codex chat uses app-managed API key
- **WHEN** a Codex chat starts with the API-key auth method selected
- **AND** a valid app-managed Codex API key exists in secure storage
- **THEN** the main process decrypts the key and injects it as `CODEX_API_KEY` for the Codex runtime
- **AND** the chat request schema does not accept `authConfig.apiKey`

#### Scenario: Codex chat uses ChatGPT auth or provider profile
- **WHEN** a Codex chat starts with ChatGPT auth or a provider profile selected
- **THEN** the main process does not inject the app-managed Codex API key into that runtime environment
- **AND** provider-profile gateway tokens remain separate from app-managed Codex API keys

### Requirement: Secure Storage Fail-Closed Writes
The system SHALL fail closed when writing new provider or desktop auth credentials if Electron `safeStorage` encryption is unavailable or encryption fails.

#### Scenario: Safe storage is unavailable during provider credential save
- **WHEN** a provider credential or Codex API key is saved
- **AND** Electron `safeStorage` encryption is unavailable
- **THEN** the save fails with an actionable error
- **AND** the system does not write a base64, plaintext, or `.json` fallback secret

#### Scenario: Legacy base64 credential exists
- **WHEN** an existing encrypted credential value uses the legacy `locus:v1:base64:` fallback format
- **THEN** the system can read it for compatibility or migration
- **AND** new encryption writes never create that fallback format

### Requirement: Legacy Renderer Codex Key Migration
The system SHALL migrate legacy renderer-local Codex API keys to main-process secure storage without continuing to use renderer-local plaintext as an auth source.

#### Scenario: Legacy localStorage key exists
- **WHEN** the renderer starts and finds a legacy Codex API-key localStorage value
- **THEN** it attempts to save the key through the main-process Codex API-key save procedure
- **AND** it clears the legacy localStorage value after the migration attempt
- **AND** if the migration fails, it prompts the user to re-save the key instead of using the legacy value for chat auth

