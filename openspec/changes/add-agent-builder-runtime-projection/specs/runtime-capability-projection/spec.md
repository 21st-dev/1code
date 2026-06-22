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

#### Scenario: Locus Agent is materialized natively
- **WHEN** Locus materializes an Agent into a runtime-native format for a managed
  run
- **THEN** the projection record includes the Locus Agent id, runtime id,
  projection mode, target scope, content fingerprint, availability status, and
  non-secret reason text
- **AND** the runtime can receive only projections that are compatible with its
  capability manifest and adapter proof
- **AND** first-version native materialization targets only Locus-managed
  isolated runtime homes, not user-managed global or project runtime directories

#### Scenario: Runtime global directory has unmanaged agents
- **WHEN** a runtime global directory contains native agent files that Locus did
  not project
- **THEN** the system may list them as runtime-native discovered agents
- **AND** does not treat them as Locus-managed projection records
- **AND** does not stage or copy them into isolated runtime homes by default

### Requirement: Native Agent Projection Write Boundary

The system SHALL protect user-managed runtime agent directories from first-pass
native projection writes.

#### Scenario: Initial native projection is requested
- **WHEN** Locus first supports native materialization for a Locus Agent and
  runtime
- **THEN** it writes or stages the native representation only inside a
  Locus-managed isolated runtime home for the managed run
- **AND** it does not write to `~/.claude/agents`, project `.claude/agents`, or
  another user-managed runtime directory

#### Scenario: Durable runtime directory write is requested
- **WHEN** a user or caller requests projection into a user-managed runtime
  directory
- **THEN** the system requires a later approved change that defines ownership
  markers, drift detection, conflict preview, explicit confirmation, rollback,
  and smoke evidence
- **AND** until that change exists, the write is blocked with a non-secret reason

### Requirement: Agent Projection Proof Is Mode-Specific

The system SHALL evaluate Agent projection proof according to the projection mode
being claimed.

#### Scenario: Prompt-context projection is evaluated
- **WHEN** Locus reports prompt-context projection for an Agent
- **THEN** proof requires that the selected runtime path resolves the Agent and
  applies sanitized prompt context before provider work starts
- **AND** proof does not claim runtime-native subagent execution

#### Scenario: Native projection is evaluated
- **WHEN** Locus reports native-loadable projection for an Agent
- **THEN** proof requires runtime-specific materialization, isolated or scoped
  runtime discovery, drift checks, and tests or smoke evidence for that runtime
- **AND** prompt injection alone does not satisfy native-loadable status

#### Scenario: Plugin-provided agent is evaluated
- **WHEN** a plugin-provided agent appears in Agent Builder
- **THEN** its availability follows plugin-specific review, trust, drift, and
  runtime-native activation rules
- **AND** an Agent projection record alone does not prove plugin runtime-native
  execution
