# Change: Kun guarded shell via danger-full-access

## Why

Kun v1 cannot run shell: under `--sandbox-mode workspace-write`, Kun's
`sandboxBlockForTool` blocks every `command_execution` tool and does not advertise
it. A coding agent that cannot run tests/build/git/install is half a tool. Shell
is only reachable when Kun's sandbox does not pre-block it (`danger-full-access`),
which makes the **Locus guard the sole gate** for all side effects — the
Claude/Codex model. This is a deliberate, high-risk security-posture change and is
kept separate from the low-risk provider work for independent review.

Depends on `add-kun-http-sse-runtime` (merged).

## What Changes

- **BREAKING (Kun launch hardening):** launch Kun with
  `--sandbox-mode danger-full-access` (still `--approval-policy on-request`,
  `insecure=false`, loopback). Both `file_change` and `command_execution` then emit
  `approval_requested`; the runtime sandbox no longer provides any backstop.
  `verifyKunReadyInfo` inverts to require `danger-full-access` and fail closed on
  any other echo; a single owned constant feeds both the launch flag and the check.
- **Bind the BYO binary to a user-blessed executable hash, not an assumption.**
  Because `danger-full-access` removes the sandbox, the approval-exemption set
  must reflect the *actual* running Kun. Kun exposes no reliable runtime version
  (`KUN_READY` and runtime info carry no version, and `--version` can fall back to
  help), so for shell-enabled runs the system MUST hash the resolved Kun
  executable with SHA-256 and enable shell only when it matches a user-blessed
  "shell-approved Kun binary" hash stored with owner-only permissions. No blessed
  hash, a hash mismatch, or an unreadable executable disables shell and falls back
  to the `workspace-write` file-only posture.
- **Route shell through the canonical guard owner, not UI approve/deny.** Per the
  ownership map, guarded allow/deny is owned by `agent-guard/decision.ts`; runtime
  adapters may only translate the provider envelope. The Kun adapter MUST feed each
  `command_execution` (and `file_change`) into the shared guard: classify risk,
  apply the scope contract, and apply high-risk shell / sensitive-path policy —
  not merely surface an ask-user-question and POST the answer back.
- **Observed-behavior backstop.** A side-effecting `tool_call`
  (`command_execution`/`file_change`) opens a bounded pending window. Observing
  the `tool_call` item alone does not fail the run, because Kun emits it before
  `approval_requested`; instead, if execution, `tool_result`, or turn completion is
  observed without a prior correlated approved decision, the run fails closed — so
  an unexpected `auto`-policy side-effecting tool cannot run unguarded regardless
  of the static registry set.
- Manifest: `hardToolGuard` and shell move toward `supported` only after the
  guarded-shell smoke and sensitive-path tests pass; `planMode` stays `degraded`
  with corrected rationale (no longer "requires workspace write").

## Capabilities

### Modified Capabilities
- `kun-runtime`: launch posture inverts to `danger-full-access` with user-blessed
  executable SHA-256 hash binding; the permission mapping routes `command_execution`
  through the canonical guard owner with scope + high-risk policy and an
  observed-behavior backstop; the manifest's `planMode` rationale and
  `hardToolGuard`/shell evidence gates are corrected for the no-sandbox-backstop
  model.

## Impact

- Affected code:
  - `src/main/lib/kun/kun-serve-launcher.ts` (`danger-full-access`;
    `verifyKunReadyInfo` inversion; one owned sandbox constant)
  - `src/main/lib/kun/kun-cli-status.ts` (resolved executable SHA-256 hashing;
    shell-disabled fallback when no blessed hash exists or the hash mismatches)
  - `src/main/lib/kun/kun-http-sse-adapter.ts` (route `command_execution` to the
    guard owner; observed-behavior backstop)
  - `src/main/lib/agent-runtime/permission-policy.ts` + `agent-guard/decision.ts`
    consumers (shell classification, scope contract, sensitive-path policy)
  - `src/shared/agent-runtime-capabilities.ts` (`kun` manifest gates)
- Security posture: Kun moves from runtime-sandbox confinement to
  Locus-guard-only gating — the central review surface; requires real smoke +
  sensitive-path/high-risk-shell tests before any `supported` claim.
- Out of scope: provider gateway synthesis (separate change). Default builds
  unchanged; Kun stays flag-gated, desktop-only.
