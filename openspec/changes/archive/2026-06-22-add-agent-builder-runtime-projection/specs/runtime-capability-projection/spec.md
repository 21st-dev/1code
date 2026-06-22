## ADDED Requirements

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
