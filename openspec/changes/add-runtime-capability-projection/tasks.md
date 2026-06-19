## 0. Proposal Status

- [x] 0.1 Add `runtime-capability-projection` spec.
- [x] 0.2 Modify `skill-registry` to separate Locus install state from runtime
  projection state.
- [x] 0.3 Modify `agent-runtime-capabilities` to require projection availability
  only where a runtime control depends on a projected concrete capability.
- [x] 0.4 Modify `architecture-ownership` to define the projection owner rule.
- [x] 0.5 Run `openspec validate add-runtime-capability-projection --strict --no-interactive`.
- 2026-06-20 status: proposal and spec deltas are valid; implementation remains
  gated by the prerequisites below.

## 1. Prerequisites

- [ ] 1.1 Confirm `add-mcp-registry-install` has landed with its MCP
  verified/setup semantics preserved.
- 2026-06-20 not satisfied: `add-mcp-registry-install` is still active at 39/45
  with real Claude/Codex runtime proof and verified-state tasks intentionally
  unchecked, so Runtime Capability Projection implementation must not start yet.
- [ ] 1.2 Confirm this change is implemented as Phase 1 Codex registry skill
  projection first, not a bundled rewrite of Skills, MCP, and Plugins.
- [ ] 1.3 Confirm the current Skills registry and Codex app-server isolated home
  code paths before implementation.
- [ ] 1.4 Update `docs/OWNERSHIP_MAP.md` to name the Runtime Capability
  Projection owner before implementation changes projection logic.

## 2. Projection Service

- [ ] 2.1 Create the Runtime Capability Projection service owner.
- [ ] 2.2 Define shared projection result types and non-secret diagnostics.
- [ ] 2.3 Add a Skill projection adapter contract.
- [ ] 2.4 Ensure route/UI code calls the service instead of deriving projection
  state directly.

## 3. Codex Skill Projection

- [ ] 3.1 Store registry-managed skill install metadata as Locus canonical install
  truth.
- [ ] 3.2 Implement Codex registry skill projection into managed isolated
  `CODEX_HOME/skills`.
- [ ] 3.3 Exclude unmanaged global Codex skills from isolated homes unless they are
  explicitly adopted by a later approved change.
- [ ] 3.4 Preserve local modified/update/rollback behavior.
- [ ] 3.5 Keep Claude skill discovery behavior unchanged in Phase 1 except for
  install/availability wording and shared owner alignment.

## 4. Runtime Availability UI

- [ ] 4.1 Replace ambiguous `installed` runtime labels with install plus
  availability state.
- [ ] 4.2 Show `Available`, `Unavailable`, `Incompatible`, and `Not projected` per
  runtime where applicable.
- [ ] 4.3 Show concise non-secret reasons and remediation hints.
- [ ] 4.4 Keep plugin-owned and registry-owned protections intact.

## 5. Shared Capability Alignment

- [ ] 5.1 Register Skills as the first projection-backed capability kind.
- [ ] 5.2 Define extension-point shape for future MCP and Plugins projection
  registration without requiring consumers or placeholder adapters before those
  kinds are explicitly registered.
- [ ] 5.3 Confirm MCP still uses connection/tools/tool-call proof for verified
  state.
- [ ] 5.4 Confirm Plugins still use runtime-native activation identity for
  verified/native state.

## 6. Tests And Smoke

- [ ] 6.1 Add unit tests for projection selection and exclusion of unmanaged global
  Codex skills.
- [ ] 6.2 Add tests for Codex isolated home skill staging.
- [ ] 6.3 Add tests for availability state serialization and renderer-safe
  diagnostics.
- [ ] 6.4 Run focused Skills registry tests.
- [ ] 6.5 Run focused Codex app-server home preparation tests.
- [ ] 6.6 Run real or equivalent smoke proving a registry-managed Codex skill
  appears in the isolated managed run home.
- [ ] 6.7 Run `bun run check`.
