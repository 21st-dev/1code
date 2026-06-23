# Spec Delta: qwen-code-runtime

## MODIFIED Requirements

### Requirement: Runtime-Neutral Desktop Chat Entry

The system SHALL serve Qwen desktop chat through the shared runtime-id dispatch
desktop chat route defined by agent-runtime-core, rather than a Qwen-literal
route. The route SHALL validate the envelope and enabled runtime only; durable
preflight, provider binding, permission policy, adapter execution, event
normalization, and redaction SHALL remain in their canonical owners. Qwen runtime
behavior SHALL be unchanged by adopting the shared dispatch route.

#### Scenario: Qwen desktop chat starts through the shared runtime route
- **WHEN** the Qwen flag is enabled and the renderer starts a `qwen-code`
  desktop chat
- **THEN** the shared runtime-dispatch route selects the Qwen adapter and
  delegates to desktop preflight, permission policy, provider binding, adapter
  execution, event normalization, and redaction owners
- **AND** the route does not duplicate those owners' business rules

#### Scenario: Qwen behavior is preserved under shared dispatch
- **WHEN** Qwen desktop chat moves from the Qwen-literal route to the shared
  runtime-dispatch route
- **THEN** Qwen streaming, cancellation, permission, and error behavior are
  unchanged

#### Scenario: Existing runtime routes remain unchanged
- **WHEN** the shared runtime-dispatch route is adopted for experimental runtimes
- **THEN** existing Claude and Codex desktop chat routes continue to own their
  current envelopes until a later approved migration changes them
