## MODIFIED Requirements

### Requirement: Capability Scopes
The system SHALL distinguish runtime-neutral capabilities from runtime-specific capabilities.

#### Scenario: Capability is runtime-neutral
- **WHEN** a feature is presented as runtime-neutral
- **THEN** every runtime allowed to use that feature reports `supported` for the required capability set
- **AND** callers apply the same safety, event, cancellation, and result semantics across those runtimes
- **AND** a runtime with `degraded` or `unsupported` state is gated out or shown with explicit downgrade behavior

#### Scenario: Capability is runtime-specific
- **WHEN** a capability is available only for Claude Code, Codex, or another selected runtime
- **THEN** the system may expose it as a first-class runtime-specific capability
- **AND** UI, CLI, jobs, and protocol surfaces label it with its owning runtime
- **AND** other runtimes are not required to emulate it for the owning runtime's feature to ship

#### Scenario: Runtime-specific capability is requested for the wrong runtime
- **WHEN** a caller requests a runtime-specific capability for a runtime that does not own or support it
- **THEN** the system rejects or disables the request before provider work starts
- **AND** returns a normalized unsupported-capability diagnostic

#### Scenario: Folderless assistant is advertised as runtime-neutral
- **WHEN** folderless quick chat is presented for both Claude and Codex
- **THEN** both runtimes report supported assistant-tier pre-tool enforcement for web-only quick chat
- **AND** any adapter path that cannot prove fail-closed assistant enforcement is gated out or labeled degraded before the user starts a quick chat with that runtime
