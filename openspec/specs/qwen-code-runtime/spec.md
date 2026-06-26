# qwen-code-runtime Specification

## Purpose
TBD - created by archiving change add-qwen-acp-spike. Update Purpose after archive.
## Requirements
### Requirement: Flag-gated Qwen Code runtime registration

The system SHALL distinguish desktop/manifest exposure for `qwen-code` from
non-desktop contract runtime IDs. Product Qwen Code runtime exposure SHALL be
controlled by a persisted, off-by-default Settings value owned by the
main-process runtime-feature settings owner. The `LOCUS_ENABLE_QWEN_CODE_RUNTIME`
environment variable SHALL NOT be the product gate; it MAY be honored only as a
dev/test override outside packaged product gating. Non-desktop contract surfaces
SHALL consume a narrower contract runtime set that remains Claude Code + Codex,
independent of the Qwen desktop gate.

#### Scenario: Default off keeps two-runtime behavior
- **WHEN** the persisted Qwen runtime setting is off
- **THEN** the experimental runtime chat route fails closed for `qwen-code`
- **AND** the runtime registry and manifest lookup omit or reject `qwen-code`
- **AND** renderer surfaces that follow manifests do not show Qwen Code
- **AND** Local Job API, headless CLI, schedules, headless job store, and
  `locus acp` reject the runtime from their static contract runtime set
- **AND** no `qwen-code` option is offered in the renderer new-chat, engine, or
  onboarding surfaces

#### Scenario: Setting on admits the third runtime
- **WHEN** the persisted Qwen runtime setting is on
- **THEN** the experimental runtime chat route admits `qwen-code` and constructs
  the Qwen ACP adapter with adapter source `qwen-acp-client`
- **AND** the runtime registry and manifest lookup include `qwen-code` for
  desktop callers
- **AND** the permission layer recognizes `qwen-code` as a permission runtime
- **AND** non-desktop entrypoints remain rejected because `qwen-code` is not in
  the contract runtime set

#### Scenario: Env is a dev/test-only override
- **WHEN** `LOCUS_ENABLE_QWEN_CODE_RUNTIME=1` is set in an unpackaged dev/test
  run
- **THEN** Qwen Code runtime surfaces may be enabled for tests and explicit smoke
  harnesses
- **AND** the same env value does not enable Qwen Code in packaged product mode

#### Scenario: Disabling Qwen stops active Qwen work
- **WHEN** the user disables Qwen while a Qwen desktop run is active or waiting
  on a tool approval
- **THEN** active Qwen streams are aborted and pending Qwen approvals are
  denied/cleared
- **AND** a later approval response for that disabled Qwen run fails closed

#### Scenario: Qwen remains runtime-managed rather than provider-bound
- **WHEN** Qwen Code runtime is enabled by the Settings gate
- **THEN** Qwen still uses its own CLI-managed auth/model/provider configuration
- **AND** Locus does not expose Qwen as a Provider Profile target or route Qwen
  through the Locus provider gateway

### Requirement: Local ACP Client Transport

The system SHALL launch the Qwen Code runtime via `qwen --acp` over local stdio.
This change SHALL NOT implement `qwen serve`, HTTP `/acp`, or remote HTTP+SSE
daemon transport semantics. The stdio transport SHALL support spawn, ready,
graceful shutdown, crash handling, stderr redaction, and cancellation. The
transport MAY add only allowlisted, non-secret `--auth-type=<type>` and
`--model=<id>` arguments from main-process configuration; it SHALL NOT accept
arbitrary shell arguments or receive provider secrets from renderer state.

#### Scenario: ACP initialize handshake completes
- **WHEN** a `qwen-code` run starts with the flag on
- **THEN** Locus sends the ACP initialize handshake before starting the user turn
- **AND** records renderer-safe capability or readiness metadata from the
  response without exposing secrets

#### Scenario: Streaming a Qwen session
- **WHEN** a `qwen-code` run starts with the flag on
- **THEN** the transport launches `qwen --acp` and streams assistant output as
  Locus run events

#### Scenario: Headless auth type and model are explicit and non-secret
- **WHEN** the main process configures `LOCUS_QWEN_CODE_AUTH_TYPE=openai`
- **AND** the main process configures `LOCUS_QWEN_CODE_MODEL=gpt-4o-mini`
- **THEN** the transport launches Qwen with
  `--auth-type=openai --model=gpt-4o-mini --acp`
- **AND** both selectors are validated before spawning
- **AND** API keys or provider tokens are never sent from renderer state

#### Scenario: Cancellation terminates the process
- **WHEN** a user cancels an in-flight `qwen-code` run
- **THEN** the transport issues an ACP cancel and terminates the process without
  leaving an orphan

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

#### Scenario: Approved permission selects the ACP allow option
- **WHEN** Qwen emits a permission request with an ACP allow option
- **AND** Locus approval handling approves the request
- **THEN** Locus responds by selecting the ACP allow option
- **AND** records an allow decision in the runtime trace without emitting a
  permission blocker

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

