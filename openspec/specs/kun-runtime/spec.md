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

The system SHALL launch shell-enabled Kun runs with an `on-request` approval
policy, a `danger-full-access` sandbox so that both `file_change` and
`command_execution` tools reach `approval_requested` and are gated by the Locus
guard, `insecure` disabled, and a loopback host. Owned constants SHALL define the
file-only fallback sandbox value and the guarded-shell sandbox value used by both
the launch flag and `verifyKunReadyInfo`. The system SHALL reject `auto`, `never`,
`suggest`, and `untrusted` approval policies, and SHALL fail closed if the
`KUN_READY` handshake echoes any sandbox value other than the sandbox selected for
that run, a non-`on-request` policy, `insecure` true, or a non-loopback host. When
the selected sandbox is `danger-full-access`, the Locus guard SHALL be the sole
gate for every Kun side effect because Kun's runtime sandbox backstop is removed.
Because Kun exposes no runtime version (no version in `KUN_READY` or runtime
info, and `--version` is unreliable), the system SHALL bind shell to a **SHA-256
of the resolved Kun
executable** matched against a user-blessed shell-approved hash stored with
owner-only permissions; the system SHALL re-hash on each launch and SHALL enable
`danger-full-access`/shell ONLY on a match. When no blessed hash exists or the hash
does not match, the system SHALL NOT launch `danger-full-access`; it SHALL fall
back to the `workspace-write` file-only posture (shell sandbox-blocked) rather than
run shell against an unverified build. The system SHALL surface that fallback as a
current-run/session availability state: shell and active `hardToolGuard` shell
enforcement are unavailable/degraded with a non-secret diagnostic reason, not shown
as active shell support. For blessed builds the system SHALL verify that no
`command_execution` or `file_change` tool is approval-exempt except plan-scoped
`create_plan`, and SHALL keep `planMode` degraded.

#### Scenario: Hardened flags are enforced at launch
- **WHEN** Locus spawns `kun serve` for a shell-enabled run
- **THEN** it passes an `on-request` approval policy, a `danger-full-access`
  sandbox mode, a disabled insecure flag, and a loopback bind host
- **AND** it rejects `auto`, `never`, `suggest`, and `untrusted`

#### Scenario: Unblessed or mismatched binary disables shell
- **WHEN** the resolved Kun executable has no blessed shell-approved hash, or its
  re-hashed value does not match the blessed hash
- **THEN** Locus does not launch `danger-full-access` and does not enable shell
- **AND** it falls back to the `workspace-write` file-only posture instead of
  running shell against an unverified build
- **AND** runtime/session diagnostics mark shell unavailable or degraded with a
  non-secret reason such as `kun-shell-unapproved-binary` or
  `kun-shell-hash-mismatch`
- **AND** Settings/session UI does not imply active `danger-full-access` shell
  enforcement for that run

#### Scenario: Handshake drift fails closed
- **WHEN** the `KUN_READY` handshake reports a non-loopback host, `insecure` true,
  an approval policy other than `on-request`, or a sandbox mode other than the
  selected sandbox for that run
- **THEN** Locus does not start a turn and resolves the run to a Locus error event

#### Scenario: Unexpected approval-exempt side-effecting tool fails closed
- **WHEN** the verified Kun registry contains an `auto`-policy side-effecting tool
  other than plan-scoped `create_plan`
- **THEN** Locus does not start a supported turn and resolves the run to a Locus
  error event

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

The system SHALL route every Kun side effect through the canonical Locus guard
owner (`agent-guard` decision logic) and trace before allowing it; both
`file_change` and `command_execution` are approval-mediated and the Locus guard is
the sole gate because `danger-full-access` provides no runtime backstop. The Kun
adapter SHALL only translate the provider permission envelope and SHALL NOT
reimplement allow/deny: it correlates each `approval_requested` to its `tool_call`
item via the pinned invariant `approval_requested.approvalId ===
appr_${tool_call.callId}` plus matching `toolName`, classifies the side effect from
`toolKind` (`file_change` → workspace write, `command_execution` → shell,
`tool_call` → generic/MCP), normalizes the Kun envelope (lowercase tool names like
`bash`/`edit`, `toolKind`, and Kun argument/path shapes) into the guard owner's
expected category and path inputs, and feeds it to the canonical guard owner, which
applies risk classification, the scope contract, and high-risk shell /
sensitive-path policy. The adapter SHALL NOT classify risk or decide allow/deny
itself. The decision SHALL be posted to Kun's approval endpoint. The system SHALL
inherit the guard owner's policy matrix after normalization: sensitive or blocked
write paths deny; missing or non-project-local write targets deny; out-of-scope
write targets request scope expansion; in-scope writes may proceed through the
normal approval flow; shell commands may allow only when they exactly match an
approved success check, are classified as read-only inspection, or are bounded
scoped shell file operations handled by `resolveGuardedScopedShellWriteApproval`;
empty commands, shell-control or redirection ambiguity, destructive/high-risk
commands, network egress or exfiltration patterns, secret inspection,
deploy/publish or privilege-escalation commands, unknown command shapes, and
missing guard context SHALL deny without being converted into a user allow prompt.
The system SHALL fail closed — denying and tracing — when the invariant is
unverified, the mapping is missing or ambiguous, the class is unknown, the guard
owner is unavailable, or the decision times out. As an additional backstop, a
side-effecting call whose execution or `tool_result` is observed without a prior
correlated *approved* decision SHALL fail the run closed; a turn that completes
with a side-effecting call still missing any correlated decision SHALL also fail
closed. Observing the `tool_call` item alone SHALL NOT trigger the backstop,
because Kun emits `item_created`/`tool_call` before `approval_requested`.

#### Scenario: Shell is decided by the guard owner, not the adapter
- **WHEN** Kun emits an `approval_requested` correlated to a `command_execution`
  `tool_call` item
- **THEN** the adapter classifies it as a shell side effect and the canonical
  guard owner applies risk, scope contract, and sensitive-path policy to decide
  allow/deny
- **AND** the adapter posts that decision to Kun without reimplementing allow/deny

#### Scenario: High-risk Kun shell and write policy follows the guard matrix
- **WHEN** a normalized Kun write targets a sensitive, blocked, missing, or
  non-project-local path
- **THEN** the guard owner denies it before execution
- **WHEN** a normalized Kun write targets an out-of-scope project path
- **THEN** the guard owner requests scope expansion instead of allowing it
- **WHEN** a normalized Kun shell command is empty, ambiguous, high-risk,
  destructive, network-egress, secret-inspecting, deploy/publish, privilege
  escalating, unknown, or lacks guard context
- **THEN** the guard owner denies it and the adapter does not surface a user allow
  prompt
- **WHEN** a normalized Kun shell command is an approved success check, a
  read-only inspection command, or a bounded scoped shell file operation
- **THEN** it may proceed only through the corresponding guard-owner allow or
  user-approval path

#### Scenario: Unguarded side effect is caught by the observed-behavior backstop
- **WHEN** a side-effecting `command_execution`/`file_change` call's execution or
  `tool_result` is observed without a prior correlated approved decision, or its
  turn completes while still lacking any correlated decision
- **THEN** Locus fails the run closed and traces the reason
- **AND** observing the `tool_call` item before its `approval_requested` does NOT
  trigger the backstop

#### Scenario: Unresolved or unbridged approval fails closed
- **WHEN** the invariant is unverified, the matching tool_call item is absent or
  ambiguous, the class is unknown, the guard owner is unavailable, or the decision
  times out
- **THEN** Locus posts a deny, traces the fail-closed reason, and the side effect
  does not execute

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
capability id and SHALL contain no secret-bearing text. `hardToolGuard` and shell
(`command_execution`) SHALL be marked `supported` only after a guarded-shell smoke
and sensitive-path/high-risk-shell tests prove `command_execution` is decided by
the canonical guard owner; otherwise they SHALL remain `degraded`. `planMode` SHALL
be marked `degraded` because Kun's native `create_plan` is an `auto`-policy tool
that bypasses approval and Locus does not yet own its plan artifact — not because
of sandbox write mode. `providerProfiles` evidence gating is unchanged.

#### Scenario: Unwired capabilities are not claimed supported
- **WHEN** the `kun` manifest is published
- **THEN** capabilities without a wired Kun implementation are `degraded` or
  `unsupported` with an honest reason
- **AND** the manifest contains no API keys, tokens, raw headers, or secret-bearing
  environment values

#### Scenario: Shell support is evidence-backed
- **WHEN** the `kun` manifest is published
- **THEN** `hardToolGuard` and shell are `supported` only after a guarded-shell
  smoke and sensitive-path tests prove `command_execution` is decided by the
  canonical guard owner
- **AND** otherwise they are `degraded` with the proof gap

#### Scenario: Current-run shell availability reflects binary blessing
- **WHEN** the static Kun manifest supports guarded shell but the current resolved
  Kun binary has no blessed shell hash or has a hash mismatch
- **THEN** current-run capability/session diagnostics mark shell unavailable or
  degraded with a non-secret reason
- **AND** the runtime falls back to `workspace-write`
- **AND** UI surfaces do not present the run as active `danger-full-access` shell
  support

#### Scenario: Plan mode rationale is accurate
- **WHEN** the `kun` manifest is published
- **THEN** `planMode` is `degraded` because native `create_plan` is `auto` and
  bypasses approval, not because of sandbox write mode

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

