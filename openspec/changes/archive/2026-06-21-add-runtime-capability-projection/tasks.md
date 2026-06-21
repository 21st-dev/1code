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

- [x] 1.1 Confirm `add-mcp-registry-install` has landed with its MCP
  verified/setup semantics preserved.
- 2026-06-20 not satisfied: `add-mcp-registry-install` is still active at 39/45
  with real Claude/Codex runtime proof and verified-state tasks intentionally
  unchecked, so Runtime Capability Projection implementation must not start yet.
- 2026-06-22 still not satisfied: `add-mcp-registry-install` is active at 43/45.
  Claude registry install, check, real tool-call proof, and `Verified on Claude`
  upgrade are now recorded; the remaining unchecked tasks are Codex app-server
  tool-call observability and `Verified on Codex`, which stay deferred/blocked
  instead of being faked.
- 2026-06-22 satisfied: `add-mcp-registry-install` is archived at
  `openspec/changes/archive/2026-06-21-add-mcp-registry-install/`, current
  `openspec/specs/mcp-registry-install/spec.md` preserves Claude setup/check/
  verified semantics, and Codex registry install/check/`Verified on Codex`
  remain explicitly deferred when proof gates do not pass. Runtime Capability
  Projection may now proceed without taking over MCP verified-state ownership.
- [x] 1.2 Confirm this change is implemented as Phase 1 Codex registry skill
  projection first, not a bundled rewrite of Skills, MCP, and Plugins.
- 2026-06-22 confirmed from `design.md` and specs: Phase 1 is only Codex
  registry skill projection. MCP keeps Runtime MCP Config plus MCP Registry
  verified proof ownership, and Plugins keep runtime-native activation identity;
  neither kind gets placeholder projection adapters in this change.
- [x] 1.3 Confirm the current Skills registry and Codex app-server isolated home
  code paths before implementation.
- 2026-06-22 current code-path audit:
  - Skills registry install/list state lives in
    `src/main/lib/skills/registry.ts` and is exposed through
    `src/main/lib/trpc/routers/skills.ts`.
  - Registry skill install currently writes directly to runtime global skill
    dirs (`~/.claude/skills` or `~/.codex/skills`) and stores registry state
    under the selected runtime home.
  - Skills Settings queries Claude and Codex registry state separately in
    `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`, but
    the UI status is still install-state/path based rather than app-server
    isolated availability.
  - Codex app-server isolated home preparation currently lives in
    `src/main/lib/codex/app-server-plugin-home.ts` and is called by
    `src/main/lib/codex/app-server-adapter.ts`. It stages reviewed plugin
    cache entries plus auth/config into isolated `CODEX_HOME`; it does not stage
    registry-managed skills into isolated `CODEX_HOME/skills`.
- [x] 1.4 Update `docs/OWNERSHIP_MAP.md` to name the Runtime Capability
  Projection owner before implementation changes projection logic.
- 2026-06-22 completed: `docs/OWNERSHIP_MAP.md` now names
  `src/main/lib/runtime-capability-projection/` as the canonical owner for
  projection materialization, result types, per-runtime availability,
  fingerprints, and non-secret diagnostics. This is an ownership preflight only;
  projection implementation remains gated by 1.1.

## 2. Projection Service

- [x] 2.1 Create the Runtime Capability Projection service owner.
- 2026-06-22 completed: added
  `src/main/lib/runtime-capability-projection/` with an explicit service owner
  and adapter registry; unregistered kinds return no projection records instead
  of placeholder adapters.
- [x] 2.2 Define shared projection result types and non-secret diagnostics.
- 2026-06-22 completed: added shared projection states, records, source
  metadata, registered/missing-adapter result types, and validation that rejects
  secret-like diagnostic text before records can be exposed to renderer
  surfaces.
- [x] 2.3 Add a Skill projection adapter contract.
- 2026-06-22 completed: added the first concrete adapter contract for
  registry-managed Skill projection requests and records without registering
  MCP or Plugin placeholder adapters.
- [x] 2.4 Ensure route/UI code calls the service instead of deriving projection
  state directly.
- 2026-06-22 completed: `listRegistrySkills` now asks the Runtime Capability
  Projection owner to build renderer-safe Skill availability records, tRPC
  returns those projection records, and Skills UI displays the returned records
  instead of deriving availability from runtime names or filesystem paths.

## 3. Codex Skill Projection

- [x] 3.1 Store registry-managed skill install metadata as Locus canonical install
  truth.
- 2026-06-22 completed: registry skill installs now write
  `skill-registry-managed-state.json` under Locus user data with package
  metadata plus per-runtime install records. `listRegistrySkills` prefers this
  managed state and only falls back to legacy runtime-local state for
  compatibility; focused tests prove Codex installed status survives after the
  old `~/.codex/skill-registry-state.json` file is removed.
- [x] 3.2 Implement Codex registry skill projection into managed isolated
  `CODEX_HOME/skills`.
- 2026-06-22 completed: Codex app-server isolated home preparation now reads
  Locus managed skill records, maps Codex runtime installs into projection
  candidates, and stages them through the Runtime Capability Projection service
  into the run's isolated `CODEX_HOME/skills`.
- [x] 3.3 Exclude unmanaged global Codex skills from isolated homes unless they are
  explicitly adopted by a later approved change.
- 2026-06-22 completed: Codex skill projection clears the isolated
  `CODEX_HOME/skills` target and repopulates it only from managed skill records;
  it does not copy or scan unmanaged global Codex skill directories.
- [x] 3.4 Preserve local modified/update/rollback behavior.
- 2026-06-22 completed: focused managed-state tests prove registry-managed
  Codex skills still report `update-available` from older managed metadata,
  `modified` after local file edits, and rollback restores a previous user-owned
  skill while removing the managed install record.
- [x] 3.5 Keep Claude skill discovery behavior unchanged in Phase 1 except for
  install/availability wording and shared owner alignment.
- 2026-06-22 completed: focused tests prove Claude registry installs still write
  to `.claude/skills`, managed state records only the Claude runtime for a
  Claude-only skill, and Codex registry listing does not report that Claude
  install as Codex-installed.

## 4. Runtime Availability UI

- [x] 4.1 Replace ambiguous `installed` runtime labels with install plus
  availability state.
- 2026-06-22 completed: registry skill runtime cards now show separate
  `Install` and `Availability` rows for each runtime.
- [x] 4.2 Show `Available`, `Unavailable`, `Incompatible`, and `Not projected` per
  runtime where applicable.
- 2026-06-22 completed: the projection owner exposes all four projection states
  and Skills UI renders the backend state per runtime; incompatible runtimes are
  also excluded from install actions.
- [x] 4.3 Show concise non-secret reasons and remediation hints.
- 2026-06-22 completed: projection records carry validated non-secret
  diagnostics and Skills UI shows the first message plus remediation hint.
- [x] 4.4 Keep plugin-owned and registry-owned protections intact.
- 2026-06-22 completed: source-level packaging tests keep the existing
  plugin-owned and registry-owned edit protections visible while adding runtime
  availability UI.

## 5. Shared Capability Alignment

- [x] 5.1 Register Skills as the first projection-backed capability kind.
- 2026-06-22 completed: `SKILL_PROJECTION_KIND` is the only concrete
  projection kind with an implemented adapter, and Codex app-server isolated
  home preparation registers the Codex Skill projection adapter before staging
  managed skills.
- [x] 5.2 Define extension-point shape for future MCP and Plugins projection
  registration without requiring consumers or placeholder adapters before those
  kinds are explicitly registered.
- 2026-06-22 completed: the projection service exposes a generic adapter
  contract and returns `registered: false` with no projection records when a
  kind/runtime has no registered adapter; tests cover an unregistered MCP kind
  producing no placeholder records.
- [x] 5.3 Confirm MCP still uses connection/tools/tool-call proof for verified
  state.
- 2026-06-22 confirmed: `add-mcp-registry-install` keeps MCP verified usability
  under MCP-specific proof gates. Claude requires connection/tool inventory plus
  successful tool-call evidence; Codex remains deferred when those proof signals
  are unavailable. Projection availability alone must not create `Verified on
  Claude` or `Verified on Codex`.
- [x] 5.4 Confirm Plugins still use runtime-native activation identity for
  verified/native state.
- 2026-06-22 confirmed: current `runtime-plugins` spec requires bounded
  runtime-native activation identity, drift/review gates, safe mode, and MCP
  approval before native plugin activation. This projection change does not
  replace plugin activation identity or register a placeholder Plugin projection
  adapter.

## 6. Tests And Smoke

- [x] 6.1 Add unit tests for projection selection and exclusion of unmanaged global
  Codex skills.
- 2026-06-22 completed: Codex app-server home tests now include an unmanaged
  source Codex skill and prove it is not copied into isolated
  `CODEX_HOME/skills`; only managed records are projected.
- [x] 6.2 Add tests for Codex isolated home skill staging.
- 2026-06-22 completed: `tests/codex-app-server-plugin-home.test.ts` covers a
  managed Codex registry skill being symlinked into isolated
  `CODEX_HOME/skills` and a stale isolated skill being removed.
- [x] 6.3 Add tests for availability state serialization and renderer-safe
  diagnostics.
- 2026-06-22 completed: projection service tests assert projection results are
  JSON-serializable and reject secret-bearing renderer diagnostics.
- [x] 6.4 Run focused Skills registry tests.
- 2026-06-22 completed for managed install state:
  `bun test tests/skill-registry-managed-state.test.ts
  tests/codex-app-server-plugin-home.test.ts
  tests/runtime-capability-projection.test.ts`.
- [x] 6.5 Run focused Codex app-server home preparation tests.
- 2026-06-22 completed for this slice:
  `bun test tests/codex-app-server-plugin-home.test.ts
  tests/runtime-capability-projection.test.ts
  tests/skill-registry-managed-state.test.ts`.
- [x] 6.6 Run real or equivalent smoke proving a registry-managed Codex skill
  appears in the isolated managed run home.
- 2026-06-22 completed with equivalent isolated-home smoke:
  `bun test tests/codex-app-server-plugin-home.test.ts
  tests/runtime-capability-projection.test.ts
  tests/skill-registry-managed-state.test.ts
  tests/skill-registry-packaging.test.ts`. The Codex app-server home test
  creates temporary managed skill state, prepares an isolated `CODEX_HOME`, and
  proves `CODEX_HOME/skills/find-skills` is a symlink to the registry-managed
  skill while unmanaged global skills are excluded.
- [x] 6.7 Run `bun run check`.
- 2026-06-22 completed: `bun run check` passed after hardening Claude Code
  credential tests to use explicit secure-storage test overrides instead of
  relying on `electron` mock load order.
