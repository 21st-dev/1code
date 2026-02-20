## 1. Implementation
- [x] 1.1 Add continuity service module in main process with pre-run and post-run hooks.
- [x] 1.2 Integrate pre-run pack injection into Claude router call path.
- [x] 1.3 Integrate pre-run pack injection into Codex router call path.
- [x] 1.4 Add SQLite schema + migrations for continuity caches/state/artifacts.
- [x] 1.5 Implement file/search/pack cache stores with hash-based invalidation.
- [x] 1.6 Implement Anchor Pack builder (invariants, architecture map, ADR/spec refs, landmines).
- [x] 1.7 Implement Context Pack builder (relevance ranking + strict byte budgets).
- [x] 1.8 Implement Delta Pack builder (diff/test-output/task-state incremental payload).
- [x] 1.9 Implement meaningful-event detector and memory artifact drafting pipeline.
- [x] 1.10 Implement governor metrics collection and decision engine (ok/snapshot/rehydrate).
- [x] 1.11 Implement rehydrate flow using existing sub-chat/session primitives.
- [x] 1.12 Add user-facing safeguard settings (auto-write/manual-commit default, memory-branch optional).

## 2. Quality and Verification
- [ ] 2.1 Add unit tests for cache keys/invalidation and governor transitions.
- [ ] 2.2 Add integration tests for pack injection and rehydrate correctness.
- [x] 2.3 Add telemetry for cache hit/miss, injected bytes, and governor action rates.
- [x] 2.4 Validate no automatic commits occur on feature branches in default configuration.
- [ ] 2.5 Run TypeScript checks and targeted regression checks for chat streaming paths.

## 3. Rollout
- [x] 3.1 Ship behind feature flag with passive metrics-only mode first.
- [x] 3.2 Enable automatic snapshot in staged rollout.
- [ ] 3.3 Enable automatic rehydrate in staged rollout after quality gate.
- [x] 3.4 Document operator runbook and troubleshooting for continuity pipeline.
