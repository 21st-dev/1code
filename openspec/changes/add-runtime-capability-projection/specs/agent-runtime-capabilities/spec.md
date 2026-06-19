## MODIFIED Requirements

### Requirement: Capability-Driven Runtime Surfaces

The system SHALL gate runtime-dependent UI, CLI, job, and protocol behavior from
capability manifests. When the behavior depends on a concrete capability whose
kind has a registered Runtime Capability Projection adapter, the caller SHALL
also consume runtime projection availability from the Runtime Capability
Projection owner instead of inferring availability from install state or runtime
names. Capability kinds without a registered projection adapter remain governed
by their existing owner and verifier, and callers SHALL NOT fabricate projection
stubs only to satisfy this requirement.

#### Scenario: Desktop renders runtime controls
- **WHEN** the desktop UI renders controls for rollback, fork, tools, MCP, plugins, commands, workflows, App Agents, skills, attachments, or provider profiles
- **THEN** it uses the selected runtime's capability manifest to enable, disable, warn, or hide those controls
- **AND** runtime-projected concrete capabilities with registered projection adapters show runtime availability separately from Locus install state
- **AND** it does not assume Claude Code and Codex are feature-equivalent
- **AND** it does not assume a runtime lacks a feature solely from the runtime name

#### Scenario: CLI or job starts runtime work
- **WHEN** a CLI, job, schedule, or protocol caller requests runtime work with options that require specific capabilities
- **THEN** the caller validates the requested options against the selected runtime's manifest before provider work starts
- **AND** unsupported required capabilities produce normalized diagnostics and non-zero command/job failure where applicable
- **AND** concrete capabilities for registered projection adapters that are unavailable or incompatible for the selected runtime are excluded, disabled, or rejected before provider work starts

#### Scenario: Capability changes over time
- **WHEN** a runtime CLI, SDK, ACP layer, or Locus-owned shared layer adds or removes a stable primitive
- **THEN** the runtime manifest is updated through a reviewed change
- **AND** tests or smoke evidence are updated for every capability state changed to `supported`

#### Scenario: Runtime-projected capability is unavailable
- **WHEN** a concrete capability kind has a registered projection adapter
- **AND** a capability is installed in Locus but unavailable, incompatible, or not projected for the selected runtime
- **THEN** callers disable, warn, or exclude that concrete capability before provider work starts
- **AND** they expose a normalized non-secret reason instead of silently attempting to use it
