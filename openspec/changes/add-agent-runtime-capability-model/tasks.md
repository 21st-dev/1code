## 1. Proposal
- [x] 1.1 Create the standalone OpenSpec proposal for the runtime capability model.
- [x] 1.2 Define the capability scope/state semantics independently from headless jobs.
- [x] 1.3 Validate the OpenSpec change strictly.
- [ ] 1.4 Get approval before implementing product code.

## 2. Future Implementation
- [ ] 2.1 Add shared capability manifest types with runtime ID, capability ID, scope, state, reason, and optional remediation hint.
- [ ] 2.2 Add a runtime registry seam that exposes non-secret capability manifests for Claude, Codex, and future runtimes.
- [ ] 2.3 Mark runtime-neutral capabilities separately from runtime-specific capabilities.
- [ ] 2.4 Gate desktop controls through capability manifests where behavior depends on runtime support.
- [ ] 2.5 Gate CLI/job/protocol options through capability manifests before provider work starts.
- [ ] 2.6 Add tests proving `supported` claims require a real adapter/shared-layer implementation.
- [ ] 2.7 Add tests proving `degraded` and `unsupported` states are visible to callers and not silently treated as supported.
- [ ] 2.8 Update `add-headless-agent-jobs` to depend on this capability model instead of redefining the model.

## 3. Verification
- [ ] 3.1 Run focused capability model tests once implementation exists.
- [ ] 3.2 Run `bun run ts:check` once implementation exists.
- [ ] 3.3 Run `openspec validate add-agent-runtime-capability-model --strict --no-interactive`.
