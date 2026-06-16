## ADDED Requirements
### Requirement: Run Usage Inspector Widget
The system SHALL provide a Details sidebar usage widget for the current chat or run using locally observed usage data.

#### Scenario: Usage data is available for the current run
- **WHEN** the current chat or selected run has message metadata or `usage_update` events with token, duration, cost, cache, or context-window data
- **THEN** the Details sidebar usage widget summarizes the observed run usage
- **AND** the widget distinguishes input tokens, output tokens, total tokens, duration, estimated cost, cache details, and context-window occupancy when each value is available
- **AND** the widget does not claim official provider quota or billing state unless the provider explicitly reports it

#### Scenario: Usage data is partial
- **WHEN** only part of the usage data is available
- **THEN** the widget shows the available fields and marks missing provider, cost, cache, or context-window fields as unavailable
- **AND** it does not fabricate zeros, percentages, costs, or remaining quota

#### Scenario: Usage data is absent
- **WHEN** the current chat or selected run has no usable local usage metadata
- **THEN** the widget shows an unavailable state with a concise explanation
- **AND** the absence of usage metadata does not block the user from continuing the chat or inspecting other widgets
