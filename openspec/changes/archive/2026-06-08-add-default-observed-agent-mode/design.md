## Context
The current runtime control layer already owns preflight, permission policy,
desktop run requests, normalized events, and redaction. The remaining product
gap is default Agent-mode behavior:

- `permission-policy.ts` resolves unguarded Agent mode to full access or Codex
  auto mode.
- Claude has a tool permission callback that falls through to `allow`.
- Codex only installs its ACP permission handler when the policy requests it.
- Guarded runs have scope contracts and audit summaries, but normal Agent runs
  do not have an explicit observed control contract.

This change gives the default path a product-level control meaning without
turning it into default deny.

## Control Levels
The product taxonomy is:

| Level | User meaning | Runtime meaning | This change |
| --- | --- | --- | --- |
| `observe` | Agent works normally, actions are visible, risky actions are called out, run can be stopped | Allow ordinary actions by default; loudly block a tiny catastrophic set when a pre-tool hook exists; emit sanitized observed permission/tool events where hooks or stream chunks exist | Implement as default Agent mode |
| `guarded` | Agent works inside a user-approved scope contract | Enforce before execution when the runtime supports hooks; otherwise label contract-and-audit | Preserve existing guarded path |
| `strict` | Deny by default, only allow approved actions | Require a pre-execution hook and whitelist policy before provider work starts | Define as future non-goal |

## Decisions
- Decision: add a `controlLevel` field to `DesktopPermissionPolicy`.
  - Plan mode remains read-only for workspace side effects.
  - Agent mode without a scope contract resolves to `controlLevel: "observe"`.
  - Agent mode with a scope contract resolves to `controlLevel: "guarded"`.
- Decision: make the control-level model a shared enum exported from the policy
  owner.
  - Main-process adapters and renderer surfaces consume the same control-level
    values.
  - Renderer code may display the control level, but it must not infer policy
    semantics from runtime names or local string comparisons.
- Decision: do not overload `requiresPreExecutionEnforcement` for ordinary
  observation.
  - Observation is not the same thing as guarded hard enforcement.
  - Observed mode may still require a pre-tool hook for a tiny catastrophic
    denylist when the runtime can provide one.
  - Add explicit fields such as `requiresToolObservation` or
    `observationSource` if implementation needs them.
- Decision: observed mode blocks catastrophic actions loudly, not silently.
  - Catastrophic actions include high-risk shell commands already recognized by
    the guard owner, writes to sensitive paths such as secrets or credential
    files, and network-egress actions that can plausibly exfiltrate local data.
  - When a catastrophic action is blocked, the event must include the control
    level, tool name, risk category, decision, and a renderer-safe explanation.
  - If the selected runtime cannot provide a pre-tool hook, the system emits a
    degraded observation diagnostic and must not claim these catastrophic blocks
    are enforceable for that run.
- Decision: Claude default Agent mode should keep allowing tool calls but emit
  observed permission events before returning `allow`.
  - `AskUserQuestion`, plan-mode blocks, and guarded decisions keep their
    existing behavior.
- Decision: Codex default Agent mode should request an ACP permission handler
  for observation when the ACP hook is available.
  - If the hook cannot be installed, the run should continue only with a
    renderer-safe degraded observation diagnostic and stream-only tool
    visibility.
  - This diagnostic must not claim hard guard support.
- Decision: risk classification belongs to the guard owner.
  - Reuse or extract from `agent-guard/decision.ts` and
    `agent-guard/contract.ts`.
  - Include network-egress classification for tools such as `WebFetch`, MCP
    tools, shell commands using network clients, and provider/runtime
    configuration actions that can send local data outside the project.
  - Routes and renderer components may render risk labels but must not classify
    commands or tools independently.
- Decision: observed events are sanitized runtime events.
  - They may include ids, tool names, bounded commands, relative paths, risk
    levels, allow/deny intent, and control level.
  - They must not include provider secrets, full file contents, raw env, raw
    headers, or unbounded output.
- Decision: UI scope for the first implementation is compact.
  - Show the current control level on the run.
  - Show observed tool/action timeline entries in Workbench or the existing chat
    tool surfaces.
  - Highlight high-risk observed actions.
  - Keep the existing stop/cancel path visible while the run is active.

## Runtime Flow
Target shape:

```text
desktop route envelope
  -> preflight
  -> PermissionPolicy(controlLevel: observe | guarded)
  -> runtime adapter
  -> tool hook or stream-only observer
  -> sanitized observed/guard events
  -> persisted RunEvent and renderer-visible timeline
```

Observed mode allows by default except for the explicit catastrophic denylist
when a runtime hook is available. Guarded mode remains the only mode in this
change that applies scope-contract allow/deny and scope-expansion behavior.

## Implementation Slices
1. Policy model and tests.
2. Guard-owned observed risk classifier and tests.
3. Claude observed permission events.
4. Codex observed permission handler or degraded diagnostic.
5. Runtime event mapping and persistence.
6. Workbench/chat visibility.
7. Verification and smoke evidence.

Each slice should be independently testable and should not require router
extraction.

## Risks / Trade-offs
- Observed mode can be mistaken for hard enforcement.
  - Mitigation: use `observe` wording and capability-honesty tests; do not label
    observed runs as guarded.
- Codex ACP may not expose a reliable permission hook in every environment.
  - Mitigation: continue with degraded observation diagnostics and stream-only
    visibility instead of failing the normal Agent path.
- Risk classification can drift if duplicated.
  - Mitigation: make guard-owned helper tests the source of truth and add an
    architecture test that renderer/routes do not classify high-risk shell
    commands themselves.
- Event payloads can leak sensitive data if raw tool inputs are persisted.
  - Mitigation: pass all observed payloads through existing runtime redaction and
    bound commands/paths/output summaries before persistence.
