## ADDED Requirements

### Requirement: Runtime MCP Config Service Ownership

The system SHALL use a canonical Runtime MCP Config service for shared MCP config
and status behavior, with per-runtime adapters for runtime-specific config and
session materialization.

#### Scenario: MCP config behavior is extracted from routes

- **WHEN** MCP config or status behavior is moved out of Claude or Codex route code
- **THEN** the Runtime MCP Config service becomes the canonical owner for that shared
  behavior
- **AND** the same change removes or replaces route-local helper/call sites for the
  old behavior
- **AND** `docs/OWNERSHIP_MAP.md` is updated to name the service owner, route callers,
  and runtime-specific adapters

#### Scenario: Runtime-specific MCP behavior remains adapter-owned

- **WHEN** Claude, Locus-managed Codex app-server, or a future runtime needs
  runtime-specific MCP config read/write or session materialization
- **THEN** that behavior lives in the runtime's MCP adapter
- **AND** shared MCP config/status semantics are not copied into another router
