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

The system SHALL resolve the Kun executable from either an app-managed,
checksum-verified install path or a bring-your-own absolute executable path.
Managed installs SHALL be written only by the main-process Kun installer owner.
BYO resolution SHALL continue to accept persisted absolute path overrides stored
with restricted permissions, SHALL exclude the working directory and
project/repo directories from executable PATH discovery, and SHALL probe the
binary without a shell. Current Kun builds that do not expose `--version` MAY be
accepted only after a bounded `help` probe succeeds. When either Kun executable
or config file is unavailable, the system SHALL block the run and surface setup
guidance. If no allowlisted managed build exists for the current platform, Locus
SHALL provide guided BYO setup instead of claiming secure managed install.
Current upstream GUI release archives SHALL count as no allowlisted managed build
until their embedded HTTP/SSE runtime entry can be launched by Locus and verified
with a real `KUN_READY` smoke.

#### Scenario: Missing Kun blocks with guidance
- **WHEN** no managed or BYO Kun executable resolves
- **THEN** Locus blocks the Kun run before spawning and surfaces setup guidance
- **AND** managed install is offered only when a current-platform allowlisted
  build exists

#### Scenario: Missing Kun config blocks with guidance
- **WHEN** no absolute Kun config file path resolves and no provider profile is
  bound for synthesis
- **THEN** Locus blocks the Kun run before spawning and surfaces config/provider
  setup guidance
- **AND** it does not infer provider credentials from renderer state, project
  files, or unverified runtime payloads

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

### Requirement: Main-process Kun managed install

The system SHALL provide an optional managed Kun installation path owned by the
main process. Installable builds SHALL be selected only from main-process
allowlisted metadata that includes version, platform, architecture, asset URL,
asset name, SHA-256 digest, asset size, archive kind, and the expected executable
path inside the installed asset. Renderer code SHALL NOT provide download URLs,
checksums, shell commands, archive entry paths, executable paths, destination
paths, or package-manager commands for managed install/update. When no
allowlisted build exists for the current platform and architecture, managed
install SHALL be unavailable and the BYO setup path SHALL remain available.
Allowlisted builds SHALL identify a verified headless Kun runtime launch target.
Published GUI application archives SHALL NOT be allowlisted as direct runtime
executables unless Locus also owns the embedded runtime launch descriptor and has
live-smoke evidence that the installed asset emits the expected `KUN_READY`
handshake.

The installer SHALL download to an app-managed temporary directory, verify the
downloaded bytes against the allowlisted SHA-256 before extraction or
installation, reject checksum mismatches fail-closed, reject archive entries that
escape the staging/install directory, install only under
`{userData}/runtimes/kun/<version>/`, chmod the final executable `0755`, and save
the executable path through the existing Kun executable settings owner only after
all checks pass. It SHALL NOT install into `/usr/local/bin`, mutate PATH, mutate
shell profiles, or trust project/worktree files.

#### Scenario: Renderer cannot choose the install source
- **WHEN** the renderer requests Kun managed install or update
- **THEN** the request does not accept a URL, checksum, command, archive path, or
  destination path
- **AND** the main process selects the build only from its allowlist

#### Scenario: GUI app release archive is not a direct runtime executable
- **WHEN** the only known upstream release asset for the current platform is an
  Electron GUI app archive without a verified embedded-runtime launch descriptor
- **THEN** managed install remains unavailable
- **AND** Settings keeps guided BYO setup instead of offering `Install Kun`

#### Scenario: Checksum mismatch fails closed
- **WHEN** a downloaded Kun asset does not match the allowlisted SHA-256
- **THEN** Locus deletes staging data, does not extract or persist the executable
  path, and returns a renderer-safe error
- **AND** the previously active Kun executable setting remains unchanged

#### Scenario: Archive traversal is rejected
- **WHEN** a Kun archive contains an absolute path, `..` escape, or any entry
  whose resolved destination leaves the staging/install root
- **THEN** Locus rejects the install before saving an executable path

#### Scenario: Successful install stays app-managed
- **WHEN** a Kun managed install succeeds
- **THEN** the executable is located under `{userData}/runtimes/kun/<version>/`
- **AND** it is executable
- **AND** Locus persists that managed executable path for later Kun status checks

### Requirement: Managed install does not grant shell

A successful Kun managed install SHALL only mean that a verified executable is
available for normal Kun startup. It SHALL NOT approve `danger-full-access`
shell, SHALL NOT write a new `shellApprovedExecutableHash` for the installed
binary, and SHALL NOT make `hardToolGuard` or shell appear supported. Preserving
an existing approved hash is allowed only so the current executable hash can be
compared against it and fail closed on mismatch. Shell availability SHALL
continue to depend on the existing explicit "Approve current Kun build for
shell" action that stores the current executable SHA-256. When a managed update
changes the executable hash, shell SHALL automatically become hash-mismatched or
unapproved until the user explicitly re-approves the new build.

#### Scenario: Install leaves shell unapproved
- **WHEN** Kun is installed through the managed installer
- **THEN** Kun executable status may become available
- **AND** shell remains unapproved unless the user separately approves the
  current executable hash

#### Scenario: Update disables previous shell approval
- **WHEN** a managed update replaces the Kun executable with a different SHA-256
- **THEN** the existing shell-approved hash no longer matches
- **AND** Kun shell is disabled/degraded for the current run until explicit
  re-approval

### Requirement: Kun setup state distinguishes install, config, and shell

The system SHALL expose renderer-safe Kun setup state that distinguishes at least
these states: managed install unavailable, not installed, installed but no config,
installed and config ready, shell not approved, shell approved, update available,
and hash mismatch with shell disabled. Settings and onboarding surfaces SHALL NOT
collapse "installed" into "configured", "configured" into "connected", or
"installed/configured" into shell support.

#### Scenario: Settings shows honest install and shell state
- **WHEN** Kun is installed but no config path or provider profile is ready
- **THEN** Settings shows installed but setup-required for config
- **AND** it does not enable a runnable Kun chat as fully ready

#### Scenario: Settings shows hash mismatch separately
- **WHEN** the current executable hash differs from the shell-approved hash
- **THEN** Settings shows shell disabled because of hash mismatch
- **AND** it offers explicit shell re-approval rather than silently enabling shell

