## ADDED Requirements

### Requirement: Scope Contracts Feed Permission Policy
The system SHALL convert approved scope contracts into runtime permission policy before desktop runtime startup.

#### Scenario: Guarded desktop run starts
- **WHEN** a Claude or Codex desktop run has an approved guarded scope contract
- **THEN** the runtime control layer includes the approved editable paths, denied sensitive paths, allowed success checks, and expansion policy in the resolved `PermissionPolicy`
- **AND** the selected adapter receives the policy before it can start tool, shell, file, or MCP side-effect work

#### Scenario: Scope enforcement is unavailable
- **WHEN** the selected adapter cannot enforce the approved scope contract before side effects
- **THEN** guarded desktop agent mode fails closed or uses an explicitly supported fallback adapter before provider work starts
- **AND** prompt-only instructions or post-run audit alone do not satisfy guarded scope enforcement

### Requirement: Scope Expansion Uses Runtime-Neutral Response Path
The system SHALL route desktop scope expansion requests through a runtime-neutral owner rather than a Claude-only route.

#### Scenario: Runtime requests scope expansion
- **WHEN** Claude or Codex requests expanded editable scope or success checks during a guarded desktop run
- **THEN** the request is persisted and emitted as a normalized scope-expansion event
- **AND** the user response is routed through a runtime-neutral response path or the runtime is marked degraded/retry-only before provider work starts
