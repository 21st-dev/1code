## 1. Proposal and Approval
- [x] 1.1 Review active OpenSpec changes and existing runtime/control specs.
- [x] 1.2 Create this OpenSpec proposal, design, and spec deltas.
- [x] 1.3 Validate this OpenSpec change strictly.
- [x] 1.4 Get approval before implementing product code.

## 2. Permission Policy
- [x] 2.1 Add a shared desktop runtime control level model with `observe` and `guarded`; keep `strict` design-only for this change and make renderer consume the same enum.
- [x] 2.2 Make unguarded Agent mode resolve to `observe` instead of silent full-access semantics.
- [x] 2.3 Keep plan mode read-only and guarded mode tied to scope contracts.
- [x] 2.4 Model the observed-mode catastrophic denylist separately from guarded scope-contract enforcement.
- [x] 2.5 Add focused tests for Claude and Codex policy mappings, including degraded observation behavior and catastrophic-block metadata.

## 3. Guard-Owned Risk Classification
- [x] 3.1 Extract or expose a guard-owned observed tool risk classifier from existing guard tool and shell classification logic.
- [x] 3.2 Classify read, write, shell, approval, MCP/unknown, high-risk shell, sensitive-path hints, and network-egress risk without requiring a scope contract.
- [x] 3.3 Add tests proving routes and renderer UI do not own a duplicate high-risk command classifier.

## 4. Runtime Observation Hooks
- [x] 4.1 Make Claude default Agent-mode fallback `allow` emit a sanitized observed permission event with control level and risk metadata.
- [x] 4.2 Loudly deny catastrophic observed actions before execution when the runtime hook is available.
- [x] 4.3 Make Codex default Agent mode install an ACP permission handler for observation when available.
- [x] 4.4 Emit a renderer-safe degraded observation diagnostic when Codex cannot install the ACP handler, without blocking normal Agent mode.
- [x] 4.5 Preserve existing plan-mode denies, AskUserQuestion flow, and guarded scope-contract behavior.

## 5. Events, Persistence, and Redaction
- [x] 5.1 Add or reuse normalized event payloads for observed permission/tool decisions.
- [x] 5.2 Map observed chunks to persisted `RunEvent`/job events with sequence numbers.
- [x] 5.3 Redact observed payloads before persistence and renderer emission.
- [x] 5.4 Add tests for event ordering, payload bounds, and secret redaction.

## 6. Workbench and Chat Visibility
- [x] 6.1 Show the run control level for active and completed desktop Agent runs.
- [x] 6.2 Show observed tool/action timeline entries in the Workbench or existing chat tool surfaces.
- [x] 6.3 Highlight high-risk observed actions without claiming they were blocked.
- [x] 6.4 Keep stop/cancel visible for active observed runs and show canceled terminal status when used.

## 7. Verification
- [x] 7.1 Run `openspec validate add-default-observed-agent-mode --strict --no-interactive`.
- [x] 7.2 Run `bun run architecture:check`.
- [x] 7.3 Run focused policy, guard-risk, Claude permission, Codex ACP permission, event mapper, and Workbench UI tests.
- [x] 7.4 Run `bun run ts:check`.
- [x] 7.5 Run `bun run build`.
- [x] 7.6 Record desktop smoke evidence for Claude and Codex observed Agent runs, including one normal action, one high-risk highlighted action, and cancel/stop. **PASSED 2026-06-08 rerun — see `smoke-evidence.md` for DB job IDs, deny traces, cancel traces, and canary filesystem checks.**
