## ADDED Requirements
### Requirement: Guarded And Observed Control Separation
The system SHALL keep observed Agent-mode runs separate from guarded scope-contract runs.

#### Scenario: User starts observed Agent mode
- **WHEN** the user starts normal Agent mode without approving a guarded scope contract
- **THEN** the system uses observed control semantics
- **AND** no scope contract is created implicitly
- **AND** the run does not produce guarded-run audit claims such as scope-respected or hard-enforced

#### Scenario: User starts guarded Agent mode
- **WHEN** the user approves a guarded scope contract before Agent-mode execution
- **THEN** the system uses guarded control semantics
- **AND** existing scope-contract validation, enforcement, scope expansion, and audit behavior still apply

#### Scenario: Observed run has risky actions
- **WHEN** an observed run performs risky write, shell, MCP, runtime, or provider-related actions
- **THEN** the system may show risk-highlighted observed events
- **AND** those events are not treated as blocked guard events unless a guarded or strict policy made a deny decision
- **AND** observed-mode catastrophic denials are labeled as observed safety denials rather than guarded scope-contract denials
