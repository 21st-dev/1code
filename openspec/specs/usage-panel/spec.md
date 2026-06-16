# usage-panel Specification

## Purpose
Define the local Usage surface for observed token usage, context occupancy, and provider limit status without claiming unavailable account quota.
## Requirements
### Requirement: Local Usage Summary
The system SHALL provide a lightweight Usage surface that summarizes token usage observed locally by Locus.

#### Scenario: User opens usage from the sidebar
- **WHEN** the user opens the Usage control from the agents sidebar footer
- **THEN** the app shows locally observed token usage for the current chat or workspace
- **AND** the summary includes today and last 7 days totals when local message metadata is available
- **AND** the summary does not claim to know provider account remaining quota unless the provider reports it

### Requirement: Context Window Status
The system SHALL show context window occupancy when the active provider reports context window metadata.

#### Scenario: Context metadata is available
- **WHEN** the active chat has context window metadata
- **THEN** the Usage surface shows the percent used and the used/total token values

#### Scenario: Context metadata is unavailable
- **WHEN** the active chat lacks context window metadata
- **THEN** the Usage surface displays an unavailable state instead of fabricating a context percentage

### Requirement: Local Budget Estimate
The system SHALL let the user set an optional local 7-day token budget and estimate remaining usage from locally observed tokens.

#### Scenario: Local budget is set
- **WHEN** the user enters a local 7-day token budget
- **THEN** the Usage surface shows estimated remaining tokens based on locally observed last 7 days usage
- **AND** the estimate is clearly separate from official provider account quota

#### Scenario: Local budget is not set
- **WHEN** the user has not entered a local 7-day token budget
- **THEN** the Usage surface shows that the local budget is unset
- **AND** it does not fabricate a remaining-token estimate

### Requirement: Limited Provider Usage Boundaries
The system SHALL keep provider limit status focused on Claude Code OAuth and Codex.

#### Scenario: Limited provider section renders
- **WHEN** the Usage surface is opened
- **THEN** it shows Claude Code OAuth and Codex as limited-provider entries
- **AND** each entry distinguishes locally observed usage from provider-reported account limits
- **AND** custom API-key, OpenAI-compatible, DeepSeek, and Ollama providers are excluded from provider limit status

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

