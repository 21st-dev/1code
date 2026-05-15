# agent-context-recommendations Specification

## Purpose
TBD - created by archiving change add-natural-context-recommendations. Update Purpose after archive.
## Requirements
### Requirement: Natural-Language Context Recommendations
The system SHALL recommend relevant enabled skills and custom agents from the user's current chat draft without requiring an `@` trigger.

#### Scenario: Draft matches available context
- **WHEN** a user types a natural-language request that matches an enabled skill or custom agent name or description
- **THEN** the chat input shows a small set of recommended skills and agents
- **AND** each recommendation clearly identifies whether it is a skill or an agent

#### Scenario: User accepts a recommendation
- **WHEN** the user chooses a recommended skill or agent
- **THEN** the app inserts the corresponding existing mention token into the draft
- **AND** the app does not send the message automatically

#### Scenario: No relevant context exists
- **WHEN** the draft has no meaningful match against enabled skills or custom agents
- **THEN** the chat input does not show a recommendation strip

### Requirement: Explicit Recommendation Boundary
The system SHALL keep natural-language recommendations as explicit user choices.

#### Scenario: Recommendation is displayed
- **WHEN** the app displays a skill or agent recommendation
- **THEN** it must not automatically install, enable, or invoke that skill or agent
- **AND** the recommendation must use the existing skill and custom-agent discovery sources
