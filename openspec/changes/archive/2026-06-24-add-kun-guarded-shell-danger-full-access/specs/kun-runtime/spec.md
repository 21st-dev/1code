# Spec Delta: kun-runtime

## MODIFIED Requirements

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
