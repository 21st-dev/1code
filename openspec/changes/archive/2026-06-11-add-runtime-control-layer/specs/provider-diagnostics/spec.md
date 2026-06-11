## ADDED Requirements

### Requirement: Runtime Control-Layer Diagnostics
Provider diagnostics SHALL distinguish runtime control-layer readiness from provider endpoint and authentication readiness.

#### Scenario: Diagnostics run before desktop runtime startup
- **WHEN** a desktop Claude or Codex run is prepared
- **THEN** diagnostics can report preflight status, permission policy status, adapter source, provider binding status, MCP readiness, attachment readiness, local-only state, and trace persistence readiness separately
- **AND** the result contains only renderer-safe labels, IDs, statuses, and remediation hints

#### Scenario: Control-layer readiness fails
- **WHEN** preflight, permission policy, adapter selection, MCP readiness, attachment readiness, local-only guard, or trace redaction setup fails
- **THEN** diagnostics identify the failing control-layer component before provider work starts
- **AND** provider endpoint or model authentication is not blamed unless that component actually failed
