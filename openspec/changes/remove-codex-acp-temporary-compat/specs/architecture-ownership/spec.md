## MODIFIED Requirements

### Requirement: Runtime Execution Boundary Ownership
The system SHALL keep runtime request shape, adapter selection, permission
policy, event normalization, redaction, and persistence boundaries in canonical
runtime owners rather than duplicating those rules in routes, transports, or
headless adapters.

#### Scenario: Adapter selection changes
- **WHEN** a change adds, removes, or selects between batch, SDK, app-server,
  or future runtime adapter sources
- **THEN** the change updates the canonical runtime execution selector
- **AND** route, CLI, protocol, and Local Job API code do not derive a second
  durable adapter-selection truth table

#### Scenario: Runtime events cross surfaces
- **WHEN** a desktop or headless runtime emits events that are persisted or
  exposed to renderer, CLI, protocol, or Local Job API callers
- **THEN** the events pass through the canonical runtime event and redaction
  owners before persistence or external exposure
- **AND** surface-specific envelopes may map those events without owning a
  second event vocabulary

#### Scenario: Temporary dual execution path is required
- **WHEN** a migration temporarily keeps old headless batch behavior and a new
  shared runtime execution path
- **THEN** the change declares the canonical owner, migration gate, deletion
  condition or follow-up, and tests proving which path is active
- **AND** callers cannot silently choose between old and new behavior without
  that gate
