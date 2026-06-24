## Context

Kun v1 launches `--sandbox-mode workspace-write`; `sandboxBlockForTool`
(sandbox-policy.ts) blocks and hides every `command_execution` tool, so shell is
impossible and the v1 adapter hard-denies any `command_execution` approval.
`file_change` reaches `approval_requested` and is gated. The v1 Kun permission
path surfaces an ask-user-question and POSTs the answer to Kun. The canonical
guard owner is `agent-guard/decision.ts` (`classifyObservedToolRisk`, scope
contract via `isPathBlockedByContract`/`isPathInEditableScope`,
`resolveGuardedScopedShellWriteApproval`); per the ownership map, adapters may only
translate envelopes, not reimplement allow/deny. The Kun version probe
(kun-cli-status.ts) accepts a `help`-only binary as "version unavailable / ok".

## Goals / Non-Goals

**Goals:**
- Kun runs shell, gated by the shared Locus guard exactly like Claude/Codex.
- The approval-exemption set reflects the actual bound Kun binary, not an
  assumption; fail closed when the binary cannot be identified.
- Removing the sandbox backstop does not create an unguarded side-effect path.

**Non-Goals:**
- Provider gateway synthesis (separate change). Plan mode stays `degraded`.
- Bundling; non-desktop Kun.

## Decisions

- **Posture inversion to `danger-full-access`, guard is sole gate.** Only
  `danger-full-access` stops Kun pre-blocking `command_execution`; under
  `danger-full-access` + `on-request`, both `command_execution` and `file_change`
  emit `approval_requested`. `verifyKunReadyInfo` inverts to require
  `danger-full-access`; one owned constant feeds the launch flag and the check; a
  `workspace-write` echo now fails closed. *Alternative rejected:* keep
  `workspace-write` and have Locus run shell itself — Kun's tool host runs tools
  in-process; Locus can only gate via approval.
- **Binary identity = executable file hash, because Kun exposes no runtime
  version.** Verified by reading Kun source: `KUN_READY` carries no version,
  `RuntimeInfoResponse` has no version field, and `--version` is unreliable (the v1
  probe falls back to `help`). So the only stable identity signal is a **SHA-256 of
  the resolved Kun executable file**. Concretely: shell is enabled only when the
  resolved binary's hash matches a **user-blessed "shell-approved Kun binary" hash**
  recorded in Locus settings (written `0o600`, alongside the existing executable
  path override). On each launch Locus re-hashes the binary; **mismatch or no
  blessed hash → shell is NOT enabled and the run falls back to v1 behavior
  (`workspace-write`, file-only, shell sandbox-blocked)** rather than running shell
  against an unverified build. Blessing happens explicitly in Settings after the
  user opts a specific Kun build into shell; a Kun update changes the hash and
  requires a deliberate re-bless. *Why a hash, not a version:* with no sandbox
  backstop, the "only `create_plan` is auto-exempt" claim is only true for a known
  build, and Kun gives no runtime version to bind to — the file hash is the
  strongest available identity. The observed-behavior backstop is the runtime layer
  that catches drift within a blessed build.
- **Kun→guard envelope normalization (the guard owner stays the decision
  authority).** `agent-guard/decision.ts` recognizes Claude-style names (`Bash`,
  `Edit`, `Write`, `Read`, `mcp__*`) and Claude argument shapes (`file_path`,
  `path`). Kun emits lowercase `bash`/`edit` with `toolKind` and Kun argument
  shapes. So the Kun adapter MUST normalize its envelope into the guard's expected
  category + path inputs (`command_execution`→shell, `file_change`→write, extract
  Kun arg paths) BEFORE calling the guard owner; the guard owner still decides
  allow/deny + scope + sensitive-path. *Alternative:* add a runtime-neutral guard
  entry that takes `(sideEffectClass, paths, command)` directly — preferable if a
  third runtime needs it, but for now a Kun normalizer is the smaller change. Either
  way the adapter MUST NOT classify risk or decide allow/deny itself.
- **Shell flows through the canonical guard owner.** The adapter translates the
  `command_execution` envelope (correlate via `approvalId === appr_${callId}`, read
  `toolKind`/`arguments` from the `tool_call` item) and feeds it to
  `agent-guard/decision.ts`: classify risk, apply the scope contract, apply
  high-risk shell / sensitive-path policy, then POST the resulting allow/deny. The
  adapter MUST NOT reimplement allow/deny — only surface and translate. *Why:* the
  ownership map forbids a second allow/deny implementation; UI approve/deny alone
  skips scope and sensitive-path policy.
- **Observed-behavior backstop — triggered on execution/result, not on
  `tool_call` creation.** Kun's normal event order is `item_created` (`tool_call`)
  → `approval_requested` → decision → execution → `tool_result`, so a backstop that
  fired on an un-approved `tool_call` would break every normal call. The correct
  trigger: a side-effecting (`command_execution`/`file_change`) call whose
  **execution or `tool_result` is observed without a prior correlated *approved*
  decision**, or the turn completes while the side-effecting call still lacks any
  correlated decision, fails the run closed. Equivalently, each side-effecting
  `tool_call` opens a bounded pending window that must be closed by a correlated
  decision before turn completion, and only an approved decision permits
  execution/result. *Why:* catches an
  unexpected `auto` side-effecting tool from a drifted build even if the static
  registry enumeration missed it — coupling to observed behavior, not just an
  internal tool list. (`create_plan` remains the plan-scoped exception, and plan
  mode stays blocked, so it is not reached in supported turns.)
- **Shell availability is a runtime state, not only a static manifest claim.** The
  manifest may say the Kun adapter supports guarded shell only after smoke proof,
  but each run still depends on the current binary hash. If the resolved Kun binary
  has no blessed hash or the hash mismatches, Locus MUST project shell as
  unavailable/degraded for that run/session, keep `hardToolGuard` from implying
  active shell enforcement, and surface a non-secret diagnostic such as
  `kun-shell-unapproved-binary` or `kun-shell-hash-mismatch`. This diagnostic
  belongs to the runtime capability projection / session preparation surface, not
  a renderer guess from installed state.
- **High-risk shell/write policy is inherited from the guard owner.** After
  normalization, Kun write-like calls use the same guard outcomes as Claude:
  sensitive or blocked paths deny; missing/non-project-local write targets deny;
  out-of-scope write targets request scope expansion; approved in-scope writes may
  proceed through the normal approval flow. Kun shell calls use the same shell
  matrix: exact approved success checks may allow, read-only inspection commands
  may allow, bounded scoped shell file operations may be surfaced for user approval
  through `resolveGuardedScopedShellWriteApproval`, and empty commands, shell
  control/redirection ambiguity, high-risk/destructive commands, network egress or
  exfiltration patterns, secret inspection, deploy/publish/privilege escalation,
  unknown command shape, or missing guard context deny. The adapter must not
  weaken these results or convert guard denial into a user approval prompt.
- **Manifest honesty correction.** The current manifest says `planMode` is
  `degraded` because `create_plan` "requires workspace write" — stale under
  `danger-full-access`. Restate: `planMode` `degraded` because `create_plan` is
  `auto` and bypasses approval; `hardToolGuard` and shell `supported` only after
  the guarded-shell + sensitive-path smoke pass.

## Risks / Trade-offs

- **No sandbox backstop.** → Guard is sole gate; keep it fail-closed; verified
  binary binding + static registry check + observed-behavior backstop are three
  independent fail-closed layers. Pin and verify the Kun build.
- **Hardening inversion footgun.** → one owned sandbox constant for flag +
  verification; a guard test asserts a `workspace-write` echo now fails closed.
- **Adapter reimplementing guard logic.** → adapter only translates; a test/source
  guard asserts the decision comes from `agent-guard/decision.ts`, including scope
  and sensitive-path policy, not a local allow/deny.
- **Swapped/unknown BYO binary.** → fail closed when identity is unverifiable; a
  `help`-only binary is not eligible for shell.

## Migration Plan

Additive, flag-gated; no migration. Rollback = revert to the v1 `workspace-write`
launch (shell `degraded`) by flipping the one sandbox constant — independent of the
provider change.

## Open Questions

- (RESOLVED) Binary identity signal: Kun exposes no runtime version, so identity is
  a SHA-256 of the resolved executable, blessed per-build in Settings; mismatch/no
  bless → fall back to `workspace-write` (no shell). See the binding decision.
- (RESOLVED) High-risk shell/write policy: Kun inherits the canonical guard
  matrix after normalization; denials remain denials, only bounded scoped shell file
  operations and approved/read-only commands may proceed as described above.
- Normalizer vs runtime-neutral guard entry: ship the Kun normalizer now, or add a
  `(sideEffectClass, paths, command)` guard entry if a third runtime is imminent?
