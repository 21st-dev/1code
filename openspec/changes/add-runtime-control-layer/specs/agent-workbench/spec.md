## ADDED Requirements

### Requirement: Workbench Semantic Runtime Timeline
The Agent Workbench SHALL display desktop runtime traces from sanitized semantic events when they are available.

#### Scenario: User opens desktop job trace
- **WHEN** the user opens a desktop Claude or Codex job with persisted semantic events
- **THEN** the Workbench shows ordered timeline entries for assistant output, tools, guard decisions, permission requests, user questions, MCP readiness or elicitation, usage, status, errors, cancellation, and completion
- **AND** the timeline can filter or group entries by semantic event category

#### Scenario: Raw payload view is available
- **WHEN** the Workbench exposes raw job-event payloads for debugging
- **THEN** raw payloads remain secondary to semantic timeline status
- **AND** the payloads are already redacted before they reach the renderer

### Requirement: Workbench Runtime Diagnostics
The Agent Workbench SHALL distinguish runtime control-layer blockers from provider endpoint or authentication failures.

#### Scenario: Runtime preflight blocks a run
- **WHEN** desktop runtime preflight blocks a run before provider work starts
- **THEN** the Workbench shows the blocker as preflight, policy, MCP readiness, attachment readiness, local-only, or unsupported-capability state
- **AND** it does not present the failure as a provider model response failure
