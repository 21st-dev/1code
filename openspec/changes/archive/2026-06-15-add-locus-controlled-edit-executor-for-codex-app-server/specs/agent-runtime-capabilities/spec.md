## MODIFIED Requirements
### Requirement: Capability States
The system SHALL model runtime capabilities with explicit `supported`, `degraded`, and `unsupported` states.

#### Scenario: Capability is supported
- **WHEN** a runtime marks a capability as `supported`
- **THEN** the runtime adapter or a Locus-owned shared layer provides the behavior through code
- **AND** tests or smoke evidence cover the behavior before the implementation checklist is completed
- **AND** prompt-only instructions, UI labels, indexed documentation, and post-run audit alone do not satisfy the support claim
- **AND** a forced smoke prompt that only succeeds for one narrow command shape does not satisfy support for productive real UI guarded editing

#### Scenario: Capability is degraded
- **WHEN** a runtime can provide only partial, read-only, prompt-assisted, discovery-only, fail-closed-only, forced-smoke-only, or post-run-audited behavior
- **THEN** the capability state is `degraded`
- **AND** callers can display the partial behavior with a clear limitation reason
- **AND** callers do not treat the capability as fully supported for safety, mutation, execution, or automation decisions

#### Scenario: Capability is unsupported
- **WHEN** a runtime has no stable primitive and no Locus-owned shared layer for a capability
- **THEN** the capability state is `unsupported`
- **AND** callers disable, hide, or reject behavior that depends on that capability before provider work starts
- **AND** the manifest includes a concise reason when practical
