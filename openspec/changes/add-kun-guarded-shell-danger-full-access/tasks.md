# Tasks: Kun guarded shell via danger-full-access

> Approval gate: HIGH-RISK security change — do not start until this proposal is
> approved AND `add-kun-http-sse-runtime` is merged. Recommended to land
> `add-kun-provider-gateway-synthesis` first and rebase on it. Branch off clean
> `main`. Keep Kun flag OFF until the guarded-shell + sensitive-path smokes pass.

## 0. Pre-flight
- [ ] 0.1 Branch off clean `main`; pin the reference `kun` build by resolved
      executable SHA-256 hash.
- [ ] 0.2 Under `danger-full-access`, enumerate the verified Kun tool registry;
      confirm the only `auto` side-effecting tool is plan-scoped `create_plan`;
      record the executable SHA-256 hash used to bind the build.

## 1. Binary identity by executable hash (load-bearing)
- [x] 1.1 Compute a SHA-256 of the resolved Kun executable file (Kun exposes no
      runtime version — confirmed: no version in `KUN_READY`/runtime-info,
      `--version` unreliable). Persist a user-blessed "shell-approved Kun hash" in
      settings `0o600`, alongside the executable-path override.
- [x] 1.2 Re-hash on each launch; enable `danger-full-access`/shell ONLY on a
      match. No blessed hash or mismatch ⇒ do NOT launch `danger-full-access`; fall
      back to the `workspace-write` file-only posture (shell sandbox-blocked).
- [x] 1.3 Settings UI: explicit "approve this Kun build for shell" action that
      records the current hash; a Kun update changes the hash and requires
      deliberate re-bless.
- [x] 1.4 Tests: unblessed / mismatched-hash binary disables shell and falls back
      to `workspace-write` (no shell), without erroring the whole run.
- [x] 1.5 Runtime availability/session diagnostics: unblessed or mismatched hash
      projects shell as unavailable/degraded for that run, emits a non-secret
      reason (`kun-shell-unapproved-binary` / `kun-shell-hash-mismatch`), and does
      not let Settings/session UI imply active `danger-full-access` shell.

## 2. Sandbox posture inversion (BREAKING)
- [x] 2.1 Owned constants for the file-only and guarded-shell sandbox values; use
      the selected value for the launch flag and `verifyKunReadyInfo`.
- [x] 2.2 Shell-enabled runs launch with `--sandbox-mode danger-full-access`
      (keep `on-request`, `insecure=false`, loopback); unblessed runs keep
      `workspace-write`.
- [x] 2.3 `verifyKunReadyInfo` requires the selected sandbox; a `workspace-write`
      echo fails closed for shell-enabled runs, and a `danger-full-access` echo
      fails closed for file-only fallback runs.
- [x] 2.4 Guard test: flag and verification read the same constant; a drifted
      sandbox echo fails closed.

## 3. Shell through the canonical guard owner (not UI approve/deny)
- [x] 3.1 Replace the v1 hard-deny of `command_execution` approvals
      (`kun-http-sse-adapter.ts`): correlate the approval to its `tool_call` item,
      classify as a shell side effect, and feed it to the `agent-guard` decision
      owner.
- [x] 3.2 The guard owner applies risk classification, scope contract, and
      high-risk shell / sensitive-path policy; the adapter only translates and
      posts the decision (no local allow/deny).
- [x] 3.3 Extend `KunPermissionMapping` so `command_execution` maps to the shell
      class alongside `file_change`, both routed to the guard owner.
- [x] 3.4 Source guard/test: the Kun shell decision originates from
      `agent-guard/decision.ts`, including scope + sensitive-path policy.
- [x] 3.5 Kun→guard envelope normalizer: `decision.ts` recognizes Claude-style
      names (`Bash`/`Edit`/`Write`, `file_path`/`path` args); map Kun's
      `command_execution`→shell + `file_change`→write and extract Kun argument
      paths/command into the guard owner's expected inputs BEFORE calling it. (Or
      add a runtime-neutral guard entry; either way the guard owner decides.)
- [x] 3.6 Tests: Kun `bash`/`edit` envelopes normalize to the correct guard
      category and paths; a sensitive Kun path is denied by the guard owner.
- [x] 3.7 High-risk policy matrix tests: normalized Kun writes to sensitive or
      blocked paths deny; missing/non-project-local write paths deny; out-of-scope
      writes request scope expansion; approved in-scope writes may proceed.
- [x] 3.8 Shell policy matrix tests: approved success checks and read-only
      inspection commands may allow; bounded scoped shell file operations use
      `resolveGuardedScopedShellWriteApproval` and require user approval; empty,
      ambiguous shell-control/redirection, destructive/high-risk, network egress,
      secret-inspection, deploy/publish/privilege-escalation, unknown command
      shape, or missing guard context deny without surfacing a user allow prompt.

## 4. Observed-behavior backstop
- [x] 4.1 Open a bounded pending window per side-effecting `tool_call`; fail the
      run closed when its **execution/`tool_result` is observed without a prior
      correlated approved decision, or the turn completes without any correlated
      decision**. Observing the `tool_call` item alone (which Kun emits BEFORE
      `approval_requested`) MUST NOT trigger it — guard against breaking normal
      approved flows.
- [x] 4.2 Keep fail-closed semantics for shell identical to file changes
      (uncorrelated / unknown class / missing guard / timeout / abort ⇒ deny).

## 5. Manifest honesty (MODIFIED requirement)
- [x] 5.1 `hardToolGuard`/shell → `supported` only after 6.1 + sensitive-path
      tests; else `degraded`.
- [x] 5.2 Correct `planMode` rationale: `degraded` because `create_plan` is `auto`
      and bypasses approval, not "requires workspace write".
- [x] 5.3 Distinguish static adapter support from current-run availability:
      even after shell support is implemented, no bless / hash mismatch must show
      shell unavailable/degraded with a diagnostic instead of a supported-looking
      active shell state.

## 6. Acceptance (HIGH-RISK — real smoke required)
- [ ] 6.1 Guarded shell smoke: a Kun `command_execution` surfaces an approval, the
      guard owner allow runs it, deny blocks it (no execution); cancel mid-command
      leaves no process.
- [ ] 6.2 Sensitive-path / high-risk shell: an out-of-scope or sensitive-path
      shell/edit is denied by the scope + high-risk policy, not merely surfaced.
- [x] 6.3 Backstop test: an injected unguarded side-effecting `tool_call` fails the
      run closed.
- [x] 6.4 Regression: file_change allow/deny still works; `workspace-write` echo
      fails closed; flag-off unchanged; Claude/Codex/Qwen unaffected.
- [ ] 6.5 Degraded-state smoke: remove or change the blessed hash and verify Kun
      falls back to `workspace-write`, shell is unavailable/degraded in runtime
      diagnostics/UI, and the run does not claim active `danger-full-access`.
- [x] 6.6 Record evidence in `kun-shell-evidence.md`; note which capabilities
      flipped to `supported` and which stayed `degraded`.

## 7. Validate
- [x] 7.1 `openspec validate add-kun-guarded-shell-danger-full-access --strict --no-interactive`.
- [x] 7.2 `bun run check` green; flag-off behavior unchanged.
