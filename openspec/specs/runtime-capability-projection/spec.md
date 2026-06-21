# runtime-capability-projection Specification

## Purpose
Define how Locus-managed capabilities are recorded once and projected into
runtime-specific environments without making runtime global directories the
canonical install source.

## Requirements
### Requirement: Canonical Managed Capability Records

The system SHALL keep Locus-managed capability install records separate from
runtime-specific materialization directories.

#### Scenario: Capability is installed from a Locus-managed source
- **WHEN** a user installs a registry, bundled, plugin-provided, or Locus-managed capability
- **THEN** Locus records the capability kind, source, version or ref, supported runtimes, content or config fingerprint, and provenance
- **AND** runtime global directories are treated as projection targets, not as the only canonical install truth

#### Scenario: Runtime global directory contains unmanaged content
- **WHEN** a user has content in a runtime global directory that lacks Locus-managed metadata
- **THEN** Locus does not silently treat that content as registry-managed
- **AND** isolated runtime homes do not receive that content by default

### Requirement: Runtime Projection Adapters

The system SHALL materialize Locus-managed capabilities into runtime
environments through registered runtime projection adapters.

#### Scenario: Runtime prepares an isolated environment
- **WHEN** a managed runtime run prepares an isolated home or session environment
- **THEN** the runtime projection adapter stages only eligible Locus-managed capabilities for that runtime
- **AND** it records non-secret projection state and reason metadata

#### Scenario: Capability kind has no registered projection adapter
- **WHEN** a capability kind has not registered a runtime projection adapter
- **THEN** callers do not require projection availability for that kind
- **AND** the system does not create placeholder projection records or empty adapters for that kind
- **AND** the kind remains governed by its existing owner and verifier until a later approved change registers projection support

#### Scenario: Future runtime is added
- **WHEN** Locus adds another runtime that supports projected capabilities
- **THEN** the runtime provides a projection adapter and capability manifest update
- **AND** it does not fork the registry or create a second install truth

### Requirement: Install State Is Separate From Runtime Availability

The system SHALL distinguish Locus install state from runtime availability state.

#### Scenario: Capability is installed but not projected
- **WHEN** Locus has a managed capability record
- **AND** the selected runtime cannot see it, cannot support it, or has not received it
- **THEN** the UI and runtime diagnostics report it as installed but unavailable or incompatible for that runtime
- **AND** they do not imply the runtime can use it

#### Scenario: Capability is available to a runtime
- **WHEN** a runtime projection adapter proves the capability is present in the runtime's expected discovery location
- **THEN** Locus may report the capability as available for that runtime
- **AND** the availability record includes the runtime id and projection fingerprint

### Requirement: Capability Kind Proof Remains Specific

The system SHALL keep proof requirements specific to each capability kind.

#### Scenario: Skill availability is evaluated
- **WHEN** a Skill is projected to a runtime
- **THEN** availability requires runtime discovery or staged presence in the runtime's expected skill location
- **AND** Skills do not require MCP-style tool-call verification

#### Scenario: MCP usability is evaluated
- **WHEN** an MCP server is installed from a registry or config source
- **THEN** verified usability follows MCP-specific proof requirements for runtime discovery, connection, tool listing, and safe tool-call evidence
- **AND** projection availability alone does not create `Verified on Claude` or `Verified on Codex` MCP state

#### Scenario: Plugin runtime-native status is evaluated
- **WHEN** a runtime plugin is enabled or staged
- **THEN** runtime-native status follows plugin-specific activation identity proof
- **AND** a projection record alone does not prove runtime-native plugin execution
