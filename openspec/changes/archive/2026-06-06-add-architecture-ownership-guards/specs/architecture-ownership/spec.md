## ADDED Requirements

### Requirement: Canonical Ownership Map

The system SHALL maintain a canonical ownership map for cross-cutting runtime,
provider, guard, MCP, route, and renderer runtime-event state behavior.

#### Scenario: Architecture-sensitive change is started

- **WHEN** a change modifies runtime, provider, guard, auth, capability, MCP,
  chat, or renderer runtime-event state logic
- **THEN** the implementer identifies the canonical owner from the ownership map
- **AND** the change updates that owner instead of adding a parallel business
  path

### Requirement: No Duplicate Business Paths

The system SHALL reject long-lived old/new duplicate implementations for the
same business capability.

#### Scenario: Logic is extracted into a new module

- **WHEN** a route, transport, adapter, or helper extracts business logic into a
  new owner
- **THEN** the same change removes or replaces the old helper and call sites
- **AND** tests or architecture guards cover the new single-owner boundary

#### Scenario: Temporary dual path is required

- **WHEN** a migration needs a temporary second implementation
- **THEN** the change declares the canonical owner, migration flag or gate,
  deletion date or follow-up, tests or guard coverage, and deprecation comment
- **AND** callers do not silently choose between the old and new path without
  the migration gate

### Requirement: Architecture Guard Check

The system SHALL provide a local architecture guard check for known duplicate
ownership patterns.

#### Scenario: Guard check runs

- **WHEN** the architecture guard check is executed
- **THEN** it reports high-signal duplicate owner violations
- **AND** it points the implementer to the ownership map for the canonical owner
- **AND** it avoids broad keyword-only failures that would block unrelated work

### Requirement: Runtime Surface Separation

The system SHALL keep desktop chat runtime behavior and headless batch runtime
behavior as separate product surfaces.

#### Scenario: Codex desktop chat changes

- **WHEN** Codex desktop chat behavior is changed
- **THEN** it uses the desktop chat runtime owner
- **AND** `codex exec` remains headless/batch fallback rather than becoming a
  second desktop chat implementation

#### Scenario: Claude desktop chat changes

- **WHEN** Claude desktop chat behavior is changed
- **THEN** it uses the Claude desktop chat runtime owner and Claude Agent SDK
  surface
- **AND** the bundled Claude Code CLI install surface does not become a second
  desktop chat implementation
