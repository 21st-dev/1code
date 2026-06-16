## ADDED Requirements
### Requirement: Capability Trace Evidence
Runtime capability inspection SHALL be driven by canonical manifests or sanitized runtime trace evidence rather than renderer inference.

#### Scenario: Capability evidence is available
- **WHEN** a runtime, provider binding, adapter source, or shared Locus layer reports capability state through a canonical manifest or sanitized trace event
- **THEN** the UI may show capability rows with supported, degraded, or unsupported state, reason text, owner/runtime, and remediation hints
- **AND** renderer code does not infer capability truth from runtime names, provider labels, button visibility, or raw log text alone

#### Scenario: Capability evidence is unavailable
- **WHEN** provider binding or capability state is only present in logs, incidental metadata, or runtime-specific diagnostics without a canonical manifest or trace event
- **THEN** the capability inspector remains hidden, disabled, or explicitly marked unavailable for that run
- **AND** the UI does not present capability status as a complete truth table

#### Scenario: Capability row is degraded or unsupported
- **WHEN** a capability row reports degraded or unsupported state
- **THEN** the row includes the non-secret reason and a concrete next action when available
- **AND** controls that require unsupported capabilities remain disabled or fail closed before provider work starts
