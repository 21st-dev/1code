# runtime-security-baseline Specification

## Purpose
TBD - created by archiving change harden-runtime-security-baseline. Update Purpose after archive.
## Requirements
### Requirement: Provider Secrets Stay In Main-Process Boundaries
The system SHALL keep provider tokens, voice transcription keys, and runtime gateway credentials out of renderer persistence and inherited environment fallback paths.

#### Scenario: Voice transcription uses helper provider storage
- **WHEN** voice transcription is available
- **THEN** the renderer SHALL only send audio payloads and non-secret request metadata
- **AND** the main process SHALL resolve the configured `voice_transcription` helper provider credential.

#### Scenario: Inherited environment contains stale provider secrets
- **WHEN** an inherited shell or process environment contains stale provider API keys
- **THEN** selected app-managed runtime/provider configuration SHALL NOT be silently overridden by those inherited secrets.

### Requirement: Provider Gateway Errors Are Redacted
The system SHALL redact provider tokens, gateway tokens, custom secret headers, bearer values, and credentialed URLs before returning upstream gateway errors.

#### Scenario: Upstream error body echoes a provider token
- **WHEN** an upstream provider returns a failed response whose body includes a configured provider token or custom secret header value
- **THEN** the gateway SHALL return a redacted error
- **AND** the raw secret SHALL NOT be exposed to the renderer or runtime client.

### Requirement: Raw Runtime Logs Are Explicit Opt-In
The system SHALL keep raw Claude runtime logging disabled unless the user or developer explicitly enables it with `CLAUDE_RAW_LOG=1`.

#### Scenario: Development app starts without raw log opt-in
- **WHEN** the app runs in development without `CLAUDE_RAW_LOG=1`
- **THEN** raw Claude messages SHALL NOT be written to the user data log directory.

#### Scenario: Raw log opt-in is enabled
- **WHEN** `CLAUDE_RAW_LOG=1` is set
- **THEN** raw Claude messages MAY be written to the bounded raw log directory
- **AND** logging errors SHALL NOT break the main runtime flow.

### Requirement: MCP Configuration Writes Are Scoped
The system SHALL guard Claude MCP configuration mutations with normalized server names and registered project path resolution.

#### Scenario: Renderer requests a project-scoped MCP write
- **WHEN** the renderer requests a project-scoped MCP server add, update, remove, or bearer-token write
- **THEN** the main process SHALL require a registered project path
- **AND** use the registered project path when mutating Claude configuration.

#### Scenario: Renderer supplies an invalid server name
- **WHEN** an MCP server name contains unsupported characters or is empty after trimming
- **THEN** the mutation SHALL be rejected before writing Claude configuration.

### Requirement: Protocol Job Paths Are Canonical
The system SHALL canonicalize protocol job working directories through the registered project guard before creating or running headless ACP jobs.

#### Scenario: Protocol job uses a relative cwd
- **WHEN** an ACP protocol job run request supplies a relative or symlinked cwd inside a registered project
- **THEN** the stored job cwd SHALL be the canonical existing path.

