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

### Requirement: Agent Runtime Projection Records

The system SHALL model Locus Agent runtime availability through runtime
projection records instead of inferring availability from Locus install state,
runtime names, or global runtime directories.

#### Scenario: Locus Agent is prompt-projectable
- **WHEN** a Locus Agent can be applied to a runtime through prompt-context
  instructions
- **THEN** the projection state records prompt-context availability for that
  runtime
- **AND** the runtime capability state remains degraded unless native execution
  semantics are implemented and proven

#### Scenario: Runtime global directory has unmanaged agents
- **WHEN** a runtime global directory contains native agent files that Locus did
  not project
- **THEN** the system may list them as runtime-native discovered agents
- **AND** does not treat them as Locus-managed projection records
- **AND** does not stage or copy them into isolated runtime homes by default

### Requirement: Agent Projection Proof Is Mode-Specific

The system SHALL evaluate Agent projection proof according to the projection mode
being claimed.

#### Scenario: Prompt-context projection is evaluated
- **WHEN** Locus reports prompt-context projection for an Agent
- **THEN** proof requires that the selected runtime path resolves the Agent and
  applies sanitized prompt context before provider work starts
- **AND** proof does not claim runtime-native subagent execution

#### Scenario: Plugin-provided agent is evaluated
- **WHEN** a plugin-provided agent appears in Agent Builder
- **THEN** its availability follows plugin-specific review, trust, drift, and
  runtime-native activation rules
- **AND** an Agent projection record alone does not prove plugin runtime-native
  execution
