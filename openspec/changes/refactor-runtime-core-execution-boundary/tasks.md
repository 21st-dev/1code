## 1. Proposal Validation
- [x] 1.1 Confirm no active OpenSpec changes conflict with runtime core execution boundary work.
- [x] 1.2 Validate this proposal with `bunx openspec validate refactor-runtime-core-execution-boundary --strict --no-interactive`.

## 2. Shared Execution Contract
- [ ] 2.1 Add shared runtime request/result/observer types under `src/main/lib/agent-runtime/`.
- [ ] 2.2 Refactor desktop and headless request types to extend the shared base without forcing desktop-only fields into headless.
- [ ] 2.3 Add tests proving desktop request shape and headless request shape keep their required fields.

## 3. Adapter Selection
- [ ] 3.1 Replace headless `Record<runtimeId, adapter>` selection with selector-owned adapter choice.
- [ ] 3.2 Preserve current batch defaults for existing CLI, daemon, schedule, protocol, and Local Job API v1 jobs.
- [ ] 3.3 Emit sanitized adapter-source and fallback diagnostics for selected, refused, and fallback paths.
- [ ] 3.4 Add selector tests for Codex batch, Claude batch, unsupported capability, and refused interactive-without-user cases.

## 4. RunEvent Bridge
- [ ] 4.1 Route headless process events through canonical `RunEvent` creation and redaction before persistence.
- [ ] 4.2 Preserve Local Job API v1 event envelopes by mapping canonical events to v1 event types.
- [ ] 4.3 Add tests proving existing `assistant_delta`, command, status, error, and completed events remain readable through `locus api runs events`.

## 5. Permission Policy
- [ ] 5.1 Extend runtime permission policy with `interactive-user`, `policy-grant`, and `fail-closed` semantics.
- [ ] 5.2 Ensure headless/API jobs fail closed when a selected adapter needs interactive approval, AskUserQuestion, MCP elicitation, or unknown side-effect approval.
- [ ] 5.3 Add tests for plan mode, agent mode, guarded scope, policy grant, and no-user fail-closed behavior.
- [ ] 5.4 Add capability-honesty tests proving batch adapters without pre-execution hooks do not claim per-scope policy-grant enforcement.

## 6. Gated Codex App-Server Job Adapter
- [ ] 6.1 Add a Codex app-server job adapter path only after shared request, selector, event, and permission tests pass.
- [ ] 6.2 Keep `codex exec` as default batch behavior for current Local Job API v1 callers.
- [ ] 6.3 Add a smoke or equivalent DB/filesystem-backed replay proving app-server job events, permission handling, cancellation, and result persistence.

## 7. Documentation And Ownership
- [ ] 7.1 Update `docs/OWNERSHIP_MAP.md` to reflect shared execution selector and RunEvent ownership across desktop and headless.
- [ ] 7.2 Update Local Job API docs to describe v1 compatibility and deferred v2 rich interaction boundary.
- [ ] 7.3 Run targeted tests for shared request, selector, event bridge, permission policy, and Local Job API compatibility before implementation handoff.
- [ ] 7.4 Run `bun run ts:check`.
- [ ] 7.5 Run `bun run build`.
- [ ] 7.6 Run `bunx openspec validate --all --strict --no-interactive`.
- [ ] 7.7 Confirm implementation preserves existing `agent-scope-contracts` and `runtime-security-baseline` behavior unless a follow-up proposal changes them.
