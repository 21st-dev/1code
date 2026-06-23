## ADDED Requirements

### Requirement: Flag-gated Qwen Code runtime registration

The system SHALL distinguish desktop/manifest known runtime IDs from
non-desktop contract runtime IDs before adding `qwen-code`. Non-desktop contract
surfaces SHALL consume a narrower contract runtime set that remains Claude Code +
Codex in this spike, independent of the Qwen desktop feature flag.

#### Scenario: Flag off keeps two-runtime behavior
- **WHEN** the Qwen Code feature flag is off and a run requests `qwen-code`
- **THEN** the desktop runtime factory, desktop chat route, and permission layer
  reject the runtime as unsupported or disabled
- **AND** Local Job API, headless CLI, schedules, headless job store, and
  `locus acp` reject the runtime from their static contract runtime set
- **AND** no `qwen-code` option is offered in the renderer new-chat surface

#### Scenario: Flag on admits the third runtime
- **WHEN** the Qwen Code feature flag is on
- **THEN** the factory admits `qwen-code` with adapter source `qwen-acp-client`
- **AND** the permission layer recognizes `qwen-code` as a permission runtime
- **AND** non-desktop entrypoints remain rejected because `qwen-code` is not in
  the contract runtime set

### Requirement: Local ACP Client Transport

The system SHALL launch the Qwen Code runtime via `qwen --acp` over local stdio.
This change SHALL NOT implement `qwen serve`, HTTP `/acp`, or remote HTTP+SSE
daemon transport semantics. The stdio transport SHALL support spawn, ready,
graceful shutdown, crash handling, stderr redaction, and cancellation.

#### Scenario: ACP initialize handshake completes
- **WHEN** a `qwen-code` run starts with the flag on
- **THEN** Locus sends the ACP initialize handshake before starting the user turn
- **AND** records renderer-safe capability or readiness metadata from the
  response without exposing secrets

#### Scenario: Streaming a Qwen session
- **WHEN** a `qwen-code` run starts with the flag on
- **THEN** the transport launches `qwen --acp` and streams assistant output as
  Locus run events

#### Scenario: Cancellation terminates the process
- **WHEN** a user cancels an in-flight `qwen-code` run
- **THEN** the transport issues an ACP cancel and terminates the process without
  leaving an orphan

### Requirement: Runtime-Neutral Desktop Chat Entry

The system SHALL provide a narrow runtime-neutral desktop chat subscription
entry for Qwen. The route SHALL validate the envelope and enabled runtime only;
durable preflight, provider binding, permission policy, adapter execution, event
normalization, and redaction SHALL remain in their canonical owners.

#### Scenario: Qwen desktop chat starts through the runtime route
- **WHEN** the Qwen flag is enabled and the renderer starts a `qwen-code`
  desktop chat
- **THEN** the route delegates to desktop preflight, permission policy,
  provider binding, adapter execution, event normalization, and redaction owners
- **AND** the route does not duplicate those owners' business rules

#### Scenario: Existing runtime routes remain unchanged
- **WHEN** the Qwen spike is implemented
- **THEN** existing Claude and Codex desktop chat routes continue to own their
  current envelopes until a later approved migration changes them

### Requirement: ACP event and error mapping

The system SHALL map Agent Client Protocol session, stream, tool, and permission
events into Locus run events and a `DesktopRunResult`. Unknown ACP events SHALL
produce a single "unsupported event" diagnostic rather than crashing the run.

#### Scenario: Unknown event does not crash
- **WHEN** the Qwen runtime emits an ACP event Locus does not model
- **THEN** the run continues and records an "unsupported event" diagnostic

#### Scenario: Failure maps to a Locus error
- **WHEN** the Qwen runtime fails or exits abnormally
- **THEN** the run resolves to a Locus error event, not a hang or process crash

### Requirement: Conservative Qwen permission policy

The system SHALL apply a fail-closed permission policy to the Qwen Code runtime:
an approval gate SHALL be required, file writes, shell, and MCP tool calls SHALL
be routed through the Locus guard and trace, and any unmapped tool SHALL be
treated as an unknown-tool side effect. The runtime's own approvals SHALL NOT
substitute for the Locus guard.

#### Scenario: Denied permission fails closed
- **WHEN** a Qwen permission request is denied or the approval hook is unavailable
- **THEN** the action is blocked (fail-closed) and the denial is traced

### Requirement: Isolated Qwen Auth and Smoke State

The system SHALL keep Qwen spike auth and smoke state isolated from the user's
real Qwen configuration unless the user explicitly approves the write. Qwen
API keys and provider credentials SHALL remain in the main process and SHALL NOT
be sent to renderer state.

#### Scenario: Smoke setup would write Qwen config
- **WHEN** a spike smoke needs Qwen configuration for API key or Alibaba Cloud
  Coding Plan auth
- **THEN** the smoke uses isolated HOME/Qwen config and isolated Locus userData
  or stops at a read-only BYO status check
- **AND** it does not write the user's real `~/.qwen/settings.json` without
  explicit approval

#### Scenario: Renderer inspects Qwen status
- **WHEN** the renderer displays Qwen readiness or diagnostics
- **THEN** it receives only renderer-safe status, labels, and redacted metadata
- **AND** it receives no API keys, OAuth tokens, raw headers, or secret-bearing
  environment values

### Requirement: Honest Qwen capability manifest

The system SHALL publish a `qwen-code` capability manifest in which only wired
capabilities are `supported` and all others are `degraded` or `unsupported` with
honest reasons. Renderer capability gates SHALL read this manifest rather than new
hardcoded `qwen` branches beyond transport routing.

#### Scenario: Unwired capability is reported degraded
- **WHEN** the renderer inspects a `qwen-code` capability that the spike has not
  wired
- **THEN** the manifest reports it as `degraded` or `unsupported` with a reason,
  and the UI reflects that state
