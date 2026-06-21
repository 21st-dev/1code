## ADDED Requirements

### Requirement: Runtime Capability Projection Ownership

The system SHALL maintain a single owner for runtime capability projection state
for capability kinds that register projection adapters. This owner SHALL NOT own
MCP configuration writes, MCP registry install/setup state, or MCP verified
usability proof.

#### Scenario: Projection logic is added or changed
- **WHEN** a change stages, symlinks, writes, checks, removes, or reports projected capabilities for a runtime
- **THEN** it updates the Runtime Capability Projection owner or its registered runtime adapter
- **AND** it does not add a second route-local, renderer-local, or runtime-specific install/projection truth table

#### Scenario: MCP server projection boundary is added
- **WHEN** a later approved change registers MCP servers with Runtime Capability Projection
- **THEN** Runtime MCP Config remains the owner for MCP config read/write and runtime materialization
- **AND** MCP registry install remains the owner for registry browse, setup, install, check, and verified usability state
- **AND** Runtime Capability Projection owns only per-runtime or per-run projection availability and non-secret projection diagnostics

#### Scenario: Temporary migration path is required
- **WHEN** an existing runtime-specific install path must remain during migration
- **THEN** the change declares the canonical owner, migration gate, deletion condition or follow-up, tests or guard coverage, and deprecation comment
- **AND** callers cannot silently choose between the old and new projection path
