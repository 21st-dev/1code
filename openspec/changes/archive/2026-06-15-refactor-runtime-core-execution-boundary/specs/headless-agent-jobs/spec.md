## ADDED Requirements
### Requirement: Headless Runtime Event Convergence
Headless local jobs SHALL use the runtime core's canonical event bridge before
persisting runtime-visible job events.

#### Scenario: Batch process event is persisted
- **WHEN** a Codex or Claude batch adapter emits assistant output, command
  lifecycle output, status, error, or completion information
- **THEN** the headless runner maps the data into sanitized canonical runtime
  events before appending job events
- **AND** persisted job events remain ordered and replayable by existing job log
  and Local Job API readers

#### Scenario: Existing event readers remain compatible
- **WHEN** a user runs `locus jobs logs` or a downstream consumer runs
  `locus api runs events`
- **THEN** the reader receives documented job event envelopes in sequence
- **AND** it is not required to understand provider-specific chunks or desktop
  stream internals

### Requirement: Headless Adapter Selection Boundary
Headless local jobs SHALL select adapters through the runtime execution selector
instead of binding each runtime ID to exactly one adapter.

#### Scenario: Existing batch behavior is preserved
- **WHEN** an existing CLI, daemon, schedule, protocol, or Local Job API v1 job
  starts without an explicit non-batch execution profile
- **THEN** the selector chooses the existing batch behavior when capability and
  policy checks pass
- **AND** `codex exec` and `claude -p` remain available as batch adapters

#### Scenario: Rich adapter is not silently selected
- **WHEN** a richer SDK or app-server adapter is available for the same runtime
- **THEN** headless jobs do not use it unless the request, capability gate, and
  permission policy explicitly allow that adapter source
- **AND** unsupported or interactive-only requirements fail closed before
  provider work starts
