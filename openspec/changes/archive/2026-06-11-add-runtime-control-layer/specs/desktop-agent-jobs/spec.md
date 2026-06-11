## ADDED Requirements

### Requirement: Desktop Jobs Use Verified Runtime Context
Desktop chat jobs SHALL be created from verified desktop runtime preflight context.

#### Scenario: Desktop chat job starts
- **WHEN** a Claude or Codex desktop chat run creates a `source=desktop` job
- **THEN** the job uses the same verified project, chat, sub-chat, cwd, runtime, mode, and prompt preview that will be passed to runtime setup
- **AND** job creation does not allow runtime startup to continue with a different raw renderer-supplied cwd or sub-chat

#### Scenario: Preflight fails before job is running
- **WHEN** desktop runtime preflight rejects the project, chat, sub-chat, cwd, provider, MCP, attachment, or local-only state
- **THEN** no provider work starts
- **AND** the job is either not created or is persisted as failed with a renderer-safe preflight diagnostic

### Requirement: Desktop Jobs Persist Semantic Runtime Events
Desktop chat jobs SHALL persist sanitized semantic runtime events for later Workbench replay.

#### Scenario: Desktop stream emits semantic events
- **WHEN** a desktop Claude or Codex run emits assistant, tool, guard, question, MCP, usage, status, error, cancellation, or completion events
- **THEN** the system persists ordered job events with stable sequence numbers and sanitized payloads
- **AND** raw provider chunks are not required to reconstruct the Workbench timeline

#### Scenario: Secret-like payload is observed
- **WHEN** runtime events, diagnostics, MCP payloads, provider metadata, or error messages include secret-like values
- **THEN** the values are redacted before the event is persisted or emitted to the renderer
