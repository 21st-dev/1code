## 1. Ownership Guardrails

- [x] 1.1 Add `docs/OWNERSHIP_MAP.md` with canonical owners for runtime,
  provider, guard, MCP, route, headless, and renderer event-state boundaries.
- [x] 1.2 Update `AGENTS.md` with the no-double-path rule.
- [x] 1.3 Add an OpenSpec delta for the architecture ownership guardrail.

## 2. Automated Guard

- [x] 2.1 Add `scripts/check-architecture-guards.mjs`.
- [x] 2.2 Add `architecture:check` and `check` package scripts.
- [x] 2.3 Verify the guard fails on known duplicate owner patterns without broad
  keyword noise.

## 3. Confirmed Duplicate Cleanup

- [x] 3.1 Add a shared renderer runtime-event state owner.
- [x] 3.2 Replace duplicated AskUserQuestion and guarded-run atom mutation in
  Claude IPC and Codex ACP transports.
- [x] 3.3 Keep transport-specific auth, stream normalization, cancellation, and
  enqueue behavior in the transports.

## 4. Verification

- [x] 4.1 Run `openspec validate add-architecture-ownership-guards --strict --no-interactive`.
- [x] 4.2 Run `bun run architecture:check`.
- [x] 4.3 Run focused tests for runtime capabilities / guard behavior.
- [x] 4.4 Run `bun run ts:check`.
