## ADDED Requirements

### Requirement: Codex App-Server Readiness Diagnostics
Provider diagnostics SHALL distinguish Codex app-server adapter readiness from provider endpoint and authentication readiness.

#### Scenario: Codex app-server diagnostics run
- **WHEN** diagnostics are requested for a Codex provider profile or Codex runtime target
- **THEN** the result identifies the selected Codex adapter source, adapter version when available, required binary availability, app-server handshake status, and fallback status
- **AND** provider endpoint, provider auth, model compatibility, gateway readiness, MCP readiness, and runtime adapter readiness are reported as separate sanitized checks

#### Scenario: App-server readiness fails
- **WHEN** app-server startup, app-server handshake, schema compatibility, permission callback setup, or provider gateway binding fails
- **THEN** diagnostics classify the failure without collapsing it into a generic provider auth error
- **AND** diagnostic payloads redact provider secrets, gateway tokens, OAuth tokens, raw headers, and secret-bearing env values before renderer return or persistence
