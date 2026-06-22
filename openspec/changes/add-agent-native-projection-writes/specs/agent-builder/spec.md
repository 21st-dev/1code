## ADDED Requirements

### Requirement: Agent Import And Projection Are Explicit

The system SHALL require explicit user intent before importing runtime-native
agents into Locus or projecting Locus Agents into runtime-native formats.

#### Scenario: User imports a runtime-native agent
- **WHEN** the user chooses to import a runtime-native agent
- **THEN** Locus creates or previews a Locus Agent copy with provenance
- **AND** the runtime-owned source remains unchanged unless a later explicit write
  action is approved

#### Scenario: User duplicates a plugin-provided agent
- **WHEN** the user chooses to duplicate a plugin-provided agent
- **THEN** Locus creates or previews a Locus Agent copy with plugin provenance
- **AND** the plugin-provided source remains read-only

#### Scenario: User enables native projection
- **WHEN** the user enables native projection for a Locus Agent and runtime
- **THEN** Locus previews the target runtime, target scope, materialized content
  fingerprint, and overwrite or drift risk before writing
- **AND** the write is blocked when the target asset has drifted or is not owned
  by Locus-managed projection state

#### Scenario: Projection fails
- **WHEN** projection fails because the runtime is unavailable, the target scope
  is unsupported, a conflict exists, or the runtime has no stable primitive
- **THEN** Locus keeps the canonical Agent record intact
- **AND** reports the projection failure as sanitized runtime availability state
