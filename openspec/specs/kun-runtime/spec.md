# kun-runtime Specification

## Purpose
TBD - created by archiving change add-kun-http-sse-runtime. Update Purpose after archive.
## Requirements
### Requirement: Flag-gated Kun runtime registration

The system SHALL register `kun` as a desktop runtime only when the Kun runtime
feature flag is enabled. `kun` SHALL be a member of the experimental runtime set
and SHALL NOT enter the non-desktop contract runtime set, so Local Job API,
headless CLI, schedules, the job store, and `locus acp` reject it at schema/parse
time.

#### Scenario: Flag off keeps default runtimes
- **WHEN** the Kun runtime flag is off
- **THEN** the desktop runtime factory, permission layer, and capability manifest
  do not expose `kun`
- **AND** existing Claude Code, Codex, and Qwen feature-flag behavior is unchanged

#### Scenario: Flag on admits Kun on desktop only
- **WHEN** the Kun runtime flag is on
- **THEN** the desktop factory admits `kun:kun-http-sse` and the `kun` manifest is
  visible to desktop callers
- **AND** non-desktop contract surfaces still reject `kun`

### Requirement: Supervised Kun daemon lifecycle

The system SHALL launch Kun as a supervised `kun serve` child process bound to a
loopback address with a randomized port, parse the `KUN_READY` handshake before
issuing requests, fail or cancel the current Locus run when the child exits
unexpectedly during an active turn, optionally start a fresh child only for later
runs within a bounded retry budget, and terminate the child without leaving an
orphan on cancel or shutdown.

#### Scenario: Handshake gates first request
- **WHEN** Locus starts a Kun run
- **THEN** Locus waits for the `KUN_READY` handshake line and uses its reported
  host and port for all subsequent requests
- **AND** Locus issues no `/v1` request before the handshake is received

#### Scenario: Abnormal exit fails the active run and recovery is bounded
- **WHEN** the Kun child exits non-zero during a run
- **THEN** Locus resolves the active run to a Locus error or cancellation event
  and does not claim the turn can continue after restart
- **AND** any fresh-daemon recovery for later runs is bounded by retry budget and
  backoff rather than hot-looping

#### Scenario: Cancel leaves no orphan
- **WHEN** a Kun run is cancelled mid-turn
- **THEN** Locus interrupts the active turn and terminates the child
- **AND** no residual Kun process remains

### Requirement: Hardened Kun launch overrides fail-open defaults

The system SHALL launch Kun with an `on-request` approval policy, a
`workspace-write` sandbox for supported v1 chat/agent runs, `insecure` disabled,
and a loopback host. The system SHALL never use `danger-full-access` or
`external-sandbox` in v1, and SHALL reject `auto`, `never`, `suggest`, and
`untrusted`; `untrusted` is rejected because its exemptions depend on a tool
allow-list that Locus cannot set or verify through `kun serve`. The system SHALL
verify, against the pinned Kun tool registry and smoke behavior, that supported
`file_change` tools are approval-mediated and not approval-exempt, and that
`command_execution`/shell is sandbox-blocked or not advertised rather than
routed through Locus approval. Kun's native `create_plan` is a `file_change` tool
with `policy: auto`, so v1 SHALL mark `planMode` degraded and SHALL NOT launch
Kun plan/GUI-plan turns as supported behavior. The system SHALL verify the
`KUN_READY` handshake echoes the hardened values and SHALL fail closed without
issuing a turn if the registry/smoke check fails or any handshake value drifts.

#### Scenario: Hardened flags are enforced at launch
- **WHEN** Locus spawns `kun serve`
- **THEN** it passes an `on-request` approval policy, `workspace-write` sandbox
  mode, a disabled insecure flag, and a loopback bind host
- **AND** it rejects `auto`, `never`, `suggest`, and `untrusted` and does not allow
  these to be relaxed downward by user input in this version

#### Scenario: Supported file changes are approval-mediated
- **WHEN** the pinned Kun tool registry for a supported v1 run contains a
  `file_change` tool other than degraded plan-mode `create_plan`
- **THEN** Locus verifies the tool emits `approval_requested` under `on-request`
  before the file change can run
- **AND** any supported `file_change` tool that would skip approval fails closed
  before a turn starts

#### Scenario: Shell is sandbox-blocked in v1
- **WHEN** the pinned Kun tool registry or smoke run includes a
  `command_execution` tool
- **THEN** Locus verifies it is not advertised as a supported v1 capability or is
  blocked by the `workspace-write` sandbox before approval
- **AND** Locus does not wait for or require an `approval_requested` event for
  shell in v1

#### Scenario: Unexpected approval-exempt side-effecting tools fail closed
- **WHEN** the pinned Kun tool registry for a supported v1 run contains an
  unexpected side-effecting tool that is neither approval-mediated `file_change`
  nor sandbox-blocked `command_execution`
- **THEN** Locus does not start a supported turn and resolves the run to a Locus
  error event

#### Scenario: Kun plan mode is degraded in v1
- **WHEN** the `kun` manifest is published
- **THEN** `planMode` is marked `degraded`
- **AND** Locus does not claim Kun plan/GUI-plan turns are supported until a later
  change defines ownership of Kun's `.kunsdd/plan/` output or a Locus-owned plan
  capture path

#### Scenario: Handshake drift fails closed
- **WHEN** the `KUN_READY` handshake reports a non-loopback host, `insecure` true,
  an approval policy other than `on-request`, or a sandbox mode other than
  `workspace-write`
- **THEN** Locus does not start a turn and resolves the run to a Locus error event

### Requirement: Kun HTTP/SSE transport

The system SHALL drive Kun over its REST turn lifecycle and SSE event stream,
authenticating every `/v1` request with a randomized per-run `runtimeToken`
bearer. The transport SHALL create a thread, start a turn, stream
`RuntimeEvent`s over SSE, support interrupt, and map unknown event kinds to a
single "unsupported event" diagnostic rather than crashing.

#### Scenario: Turn streams over SSE
- **WHEN** a Kun turn is started
- **THEN** Locus consumes the thread SSE event stream and maps Kun run events into
  Locus normalized run events and a `DesktopRunResult`
- **AND** every `/v1` request carries the `runtimeToken` bearer

#### Scenario: Unknown event does not crash
- **WHEN** Kun emits a `RuntimeEvent` kind Locus does not model
- **THEN** the run continues and records a single "unsupported event" diagnostic

#### Scenario: Failure maps to a Locus error
- **WHEN** the Kun runtime fails, returns an unauthorized response, or the stream
  closes abnormally
- **THEN** the run resolves to a Locus error event, not a hang or crash

### Requirement: Conservative fail-closed Kun permission mapping

The system SHALL route every approval-mediated Kun side effect through the Locus
guard and trace before allowing it. In v1, supported file changes are
approval-mediated; `command_execution`/shell is sandbox-blocked or unsupported
and `planMode` is degraded because native `create_plan` bypasses approval.
Because `approval_requested` events carry only
`approvalId`, `toolName`, `status`, and an optional `summary`, the system SHALL
pin a reference Kun version and verify the v1 wire invariant
`approval_requested.approvalId === appr_${tool_call.callId}`. The system SHALL
correlate each approval to its `tool_call` turn item by the derived `callId` plus
matching `toolName` and classify the side effect from the item's `toolKind`
(`file_change`, `tool_call`; `command_execution` is not expected to reach approval
in v1). The decision SHALL be posted to Kun's approval endpoint, and the system
SHALL fail closed — denying and tracing the reason — when the version/invariant
is unverified, the mapping is missing or ambiguous, the class is unknown, the
guard bridge is unavailable, or the decision times out.

#### Scenario: Approval is classified from the tool call item
- **WHEN** Kun emits an `approval_requested` event
- **THEN** Locus derives `callId` from the verified `approvalId === appr_${callId}`
  invariant, matches a `tool_call` item with that `callId` and `toolName`, and
  classifies the side effect from `toolKind`
- **AND** routes the decision through the Locus guard and trace before posting an
  allow/deny to Kun's approval endpoint

#### Scenario: Unresolved or unbridged approval fails closed
- **WHEN** the version/invariant is unverified, the matching tool_call item is
  absent or ambiguous, the class is unknown, the guard bridge is missing, or the
  approval decision times out
- **THEN** Locus posts a deny, traces the fail-closed reason, and the side effect
  does not execute

#### Scenario: Denied side effect does not run
- **WHEN** the Locus guard denies a Kun side effect
- **THEN** Locus posts a deny to Kun's approval endpoint and records a permission
  blocker
- **AND** the workspace is not mutated by that side effect

### Requirement: Locus and Kun token separation

The system SHALL keep the Locus→Kun transport `runtimeToken` distinct from any
Kun→upstream provider credential. The `runtimeToken` is a local bearer secret and
SHALL NOT appear in the Kun process `argv`; it SHALL be passed through
`KUN_RUNTIME_TOKEN` environment. Upstream provider API keys and provider gateway
tokens SHALL NOT appear in the Kun process `argv` or in renderer payloads. In v1,
provider credentials MAY live in an explicit user-selected Kun config file, but
Locus SHALL pass only the config file path to Kun and SHALL NOT read or render the
credential values. The `runtimeToken` and provider credentials SHALL be excluded
from logs, traces, manifests, and renderer-safe metadata.

#### Scenario: Transport token stays out of argv and never carries provider secrets
- **WHEN** Locus authenticates to Kun
- **THEN** it uses the randomized per-run `runtimeToken` only and passes it
  outside CLI argv
- **AND** upstream provider API keys and provider gateway tokens are not placed in
  `argv` or sent to the renderer

#### Scenario: Provider credentials stay inside the BYO Kun config file
- **WHEN** Locus launches Kun with a configured provider
- **THEN** it passes only `--config <path>` to Kun
- **AND** it does not read, log, trace, or render the provider credential values

#### Scenario: Secrets are excluded from observable surfaces
- **WHEN** Kun runtime metadata, diagnostics, traces, or manifest are produced
- **THEN** they contain no `runtimeToken`, provider API keys, gateway tokens, or
  raw headers

### Requirement: BYO Kun executable resolution

The system SHALL resolve the Kun executable and Kun config file as bring-your-own
inputs without bundling or auto-downloading Kun. Resolution SHALL accept
persisted absolute path overrides stored with restricted permissions, SHALL
exclude the working directory and project/repo directories from executable PATH
discovery, and SHALL probe the binary without a shell. Current Kun builds that do
not expose `--version` MAY be accepted only after a bounded `help` probe succeeds.
When either Kun executable or config file is unavailable, the system SHALL block
the run and surface passive setup guidance.

#### Scenario: Missing Kun blocks with guidance
- **WHEN** no Kun executable resolves
- **THEN** Locus blocks the Kun run before spawning and surfaces passive setup
  guidance
- **AND** it does not download or bundle Kun

#### Scenario: Missing Kun config blocks with guidance
- **WHEN** no absolute Kun config file path resolves
- **THEN** Locus blocks the Kun run before spawning and surfaces passive setup
  guidance
- **AND** it does not infer provider credentials from renderer state, project
  files, or provider-profile settings

#### Scenario: Discovery excludes shadowing paths
- **WHEN** Locus discovers the Kun executable on PATH
- **THEN** it excludes the working directory and project/repo directories so a
  `./kun` cannot shadow the trusted binary
- **AND** it probes the resolved binary without a shell

### Requirement: Isolated Kun runtime state

The system SHALL run Kun against an isolated `dataDir` under Locus-managed storage
and SHALL NOT mutate the user's real Kun configuration or data without explicit
approval. The system MAY pass an explicit user-selected Kun config file path, but
it SHALL NOT write that file as part of a run.

#### Scenario: Kun runs against isolated state
- **WHEN** Locus launches Kun
- **THEN** it points Kun at an isolated `dataDir`
- **AND** it does not write the user's real Kun config/data without explicit
  approval

### Requirement: Honest Kun capability manifest

The system SHALL publish a `kun` capability manifest that marks only wired
capabilities `supported` and marks every other capability `degraded` or
`unsupported` with an honest reason. The manifest SHALL declare every known
capability id and SHALL contain no secret-bearing text.

`providerProfiles` SHALL be marked `supported` only if Kun is proven to work
against the Locus profile-scoped `responses` gateway using
`baseUrl=<gatewayEndpoint>`, `apiKey=<scoped gateway token>`, and
`endpointFormat=responses`; otherwise `providerProfiles` SHALL remain `degraded`
with that reason.

`planMode` SHALL be marked `degraded` in v1 because Kun's native `create_plan`
requires workspace write access and does not emit approval events that Locus can
deny.

#### Scenario: Unwired capabilities are not claimed supported
- **WHEN** the `kun` manifest is published
- **THEN** capabilities without a wired Kun implementation are `degraded` or
  `unsupported` with an honest reason
- **AND** the manifest contains no API keys, tokens, raw headers, or secret-bearing
  environment values

#### Scenario: Provider profile support is evidence-backed
- **WHEN** the `kun` manifest is published
- **THEN** `providerProfiles` is `supported` only after a smoke/test proves Kun can
  call the Locus profile-scoped `responses` gateway with the scoped token and
  `endpointFormat=responses`
- **AND** otherwise `providerProfiles` is `degraded` with an explicit gateway
  proof gap

