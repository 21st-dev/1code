## ADDED Requirements

### Requirement: Codex App-Server Scope Contract Enforcement
The system SHALL preserve agent scope contract enforcement when Codex desktop/chat uses the app-server adapter.

#### Scenario: App-server runs with a guarded scope contract
- **WHEN** a Codex desktop/chat run uses app-server and has an approved guarded scope contract
- **THEN** the adapter or a Locus-owned shared layer enforces write, shell, file, and MCP side-effect decisions before execution
- **AND** out-of-scope operations emit normalized guard or scope-expansion events
- **AND** prompt-only guidance or post-run audit alone does not satisfy the guarded scope contract

#### Scenario: App-server cannot enforce the scope contract
- **WHEN** the app-server adapter cannot prove pre-execution enforcement for guarded scope decisions
- **THEN** guarded Codex runs fail closed or use an explicitly supported fallback adapter
- **AND** the UI, jobs, and protocol surfaces do not present guarded Codex agent mode as supported for that adapter
