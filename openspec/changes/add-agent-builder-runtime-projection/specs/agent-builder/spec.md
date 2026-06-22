## ADDED Requirements

### Requirement: Unified Agent Builder Surface

The system SHALL provide one Agent Builder surface for reusable agent personas
instead of separate product-level App Agents and Custom Agents surfaces.

#### Scenario: User opens the Agent Builder
- **WHEN** the user opens the Agent Builder surface
- **THEN** the system lists canonical Locus Agents alongside supported
  runtime-native and plugin-provided agent listings
- **AND** each row shows source, owner runtime or plugin when applicable,
  mutability, invocation mode, and runtime availability status
- **AND** the UI does not label runtime-native or plugin-provided listings as
  editable Locus Agents unless the user imports or duplicates them

#### Scenario: Custom Agents label would be shown
- **WHEN** a user-facing label, heading, navigation item, dialog, or toast refers
  to reusable agent personas
- **THEN** it uses the approved Agent Builder vocabulary
- **AND** it does not use "Custom Agents" as a product-facing category

### Requirement: Canonical Locus Agent Source

The system SHALL treat Locus-managed Agent records as the canonical source of
truth for user-created reusable personas.

#### Scenario: User creates an agent
- **WHEN** the user creates an Agent in Agent Builder
- **THEN** the system stores it as a Locus-managed Agent record
- **AND** runtime-native files, plugin listings, or vendor global directories do
  not become canonical merely because they exist

#### Scenario: Runtime-native agent is discovered
- **WHEN** Locus discovers a Claude-native agent, Codex-native agent, or other
  runtime-owned agent definition
- **THEN** the system shows it as runtime-owned and read-only by default
- **AND** the user may import it as a new Locus Agent instead of editing it as the
  canonical record in place

#### Scenario: Plugin-provided agent is discovered
- **WHEN** a reviewed plugin exposes an agent definition
- **THEN** the system shows the agent as plugin-provided and read-only
- **AND** the user may duplicate it into a Locus Agent only through an explicit
  action that preserves source provenance

### Requirement: Agent Runtime Support Status

The system SHALL show runtime support status for each Agent without implying
feature parity across runtimes.

#### Scenario: Agent is prompt-only for a runtime
- **WHEN** a selected runtime can apply an Agent only through prompt-context
  injection
- **THEN** the Agent Builder reports prompt-only or degraded support for that
  runtime
- **AND** it does not describe the runtime as having native agent execution

#### Scenario: Agent is native-loadable for a runtime
- **WHEN** a runtime projection adapter proves the Agent is materialized in that
  runtime's expected native format for a managed run
- **THEN** the Agent Builder may report native-loadable support for that runtime
- **AND** the status includes a non-secret projection fingerprint or equivalent
  evidence reference

#### Scenario: Runtime cannot use an Agent
- **WHEN** a runtime lacks a stable native primitive and no prompt-context
  fallback is enabled
- **THEN** the Agent Builder reports unsupported or blocked status with a
  non-secret reason
- **AND** run-starting surfaces disable or warn before provider work starts

### Requirement: Agent Import And Projection Are Explicit

The system SHALL require explicit user intent before importing runtime-native
agents into Locus or projecting Locus Agents into runtime-native formats.

#### Scenario: User imports a runtime-native agent
- **WHEN** the user chooses to import a runtime-native agent
- **THEN** Locus creates or previews a Locus Agent copy with provenance
- **AND** the runtime-owned source remains unchanged unless a later explicit write
  action is approved

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

