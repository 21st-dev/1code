## ADDED Requirements
### Requirement: Observed Run Visibility
The Agent Workbench SHALL make default observed Agent-mode activity visible without presenting it as hard enforcement.

#### Scenario: User views an active observed run
- **WHEN** an observed Agent-mode run is active
- **THEN** the Workbench or linked chat surface shows the run control level, runtime, current status, and available stop/cancel action
- **AND** observed tool/action events appear in chronological order when available

#### Scenario: User views a risky observed action
- **WHEN** an observed run emits a high-risk action event
- **THEN** the Workbench or linked chat surface highlights the event as risky
- **AND** the UI does not claim the action was blocked unless the event records a deny decision

#### Scenario: User views an observed safety denial
- **WHEN** an observed run denies a catastrophic action before execution
- **THEN** the Workbench or linked chat surface shows the denied action, risk category, and renderer-safe explanation
- **AND** the UI labels the event as observed safety rather than guarded scope-contract enforcement

#### Scenario: User views a completed observed run
- **WHEN** an observed Agent-mode run completes, fails, or is canceled
- **THEN** the Workbench can show a compact observed-run summary with action counts, high-risk action counts, final status, and links to existing diff or review surfaces when local changes are present
- **AND** the summary remains local-first and does not initialize hosted upstream services
