## ADDED Requirements

### Requirement: Agent Native Materialization

The system SHALL treat native Agent materialization as a separate projection mode
that requires runtime-specific write, discovery, drift, and smoke proof.

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

#### Scenario: Native projection is evaluated
- **WHEN** Locus reports native-loadable projection for an Agent
- **THEN** proof requires runtime-specific materialization, isolated or scoped
  runtime discovery, drift checks, and tests or smoke evidence for that runtime
- **AND** prompt injection alone does not satisfy native-loadable status

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
