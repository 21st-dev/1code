## Context

Skills, MCP servers, and runtime plugins are all user-facing capabilities, but
their runtime proof requirements are different. The shared failure mode is that
an item can be installed or configured in one place while the selected runtime
cannot actually see or use it.

Skills currently expose this problem most clearly for Codex. Registry install
can write a skill into the global Codex skills location, but managed Codex
app-server runs use an isolated `CODEX_HOME`. The isolated home does not
automatically include global skills, so install state and runtime availability
can diverge.

## Goals / Non-Goals

Goals:

- Make Locus-managed install state separate from runtime availability.
- Stage only eligible Locus-managed Codex registry skills into isolated Codex
  runtime homes.
- Support future projected capability kinds through a shared owner and runtime
  adapters rather than duplicate route/UI logic.
- Reuse the same projection vocabulary for Skills, MCP, and Plugins.
- Keep verifier strength proportional to the capability kind.

Non-goals:

- Do not make Skills require MCP-style connection/tool-call verification.
- Do not expose the entire user global runtime directory to isolated runs.
- Do not rewrite MCP registry install or plugin activation proof in this change.
- Do not move Settings IA or Commands ownership in this change.
- Do not make `agent-runtime-capabilities` own per-package availability state.

## Model

A projected capability has three layers:

1. Managed record
   - capability kind: `skill`, `mcp_server`, `runtime_plugin`
   - source: registry, bundled, user, plugin, project
   - source id, version/ref, content hash, provenance, supported runtimes
   - local modified/update metadata where applicable

2. Runtime projection
   - target runtime id
   - target adapter/source, such as Codex isolated home
   - projection state: `available`, `unavailable`, `incompatible`,
     `not_projected`
   - non-secret reason and remediation hint
   - projection fingerprint

3. Kind-specific proof
   - Skill: staged package is present and discoverable by the target runtime path
   - MCP: runtime connection/tools/tool-call proof
   - Plugin: runtime-native activation identity proof

## Ownership

- Runtime capability truth remains owned by
  `src/shared/agent-runtime-capabilities.ts`.
- Runtime capability projection is owned by a new main-process service, for
  example `src/main/lib/runtime-capability-projection/`.
- Skill-specific registry package metadata remains in the Skills registry owner.
- Runtime-specific staging lives in runtime projection adapters, not renderer code
  and not duplicated tRPC route helpers.
- Projection records may be exposed to renderer surfaces, but renderer code must
  not derive projection truth from runtime names or filesystem guesses.

## MCP Boundary

MCP behavior is split across existing owners and this change must not collapse
those layers.

- Runtime MCP Config service owns MCP config read/write, status, and runtime
  materialization.
- `add-mcp-registry-install` owns registry browse, setup classification, install
  orchestration, Check behavior, and `Verified on Claude` / `Verified on Codex`
  usability state.
- Runtime Capability Projection owns only per-runtime or per-run projection
  availability for capability kinds that have registered projection adapters.
- MCP verified usability still requires MCP-specific proof: runtime discovery,
  connection, tool listing, and safe tool-call evidence.

Phase 1 registers Skills only. MCP servers and Plugins may align with the shared
projection vocabulary later, but callers must not require MCP or Plugins
projection availability or create placeholder adapters before those kinds are
explicitly registered by an approved change.

## Decisions

### Phase 1: Codex Skill Projection Fix

Introduce the minimal projection service needed by registry-managed Codex Skills.
During managed Codex app-server home preparation, stage or symlink eligible
Locus-managed Codex skills into the isolated `CODEX_HOME/skills`. Do not include
unmanaged global `~/.codex/skills` wholesale.

Claude skill behavior is not rewritten in Phase 1. Claude may keep using its
existing global skill discovery path while the UI and specs clarify that install
state and runtime availability are separate concepts.

### Phase 2: Runtime Availability UI

Change Skills UI wording so `installed` means Locus has the package/record.
Show runtime-specific availability separately for Claude, Codex, and future
runtimes. Show unavailable/incompatible reasons when a runtime cannot see or
support a skill.

### Phase 3: General Projection Contract

Define reusable projection interfaces for capability kinds. Register Skills as
the first implementation. Future MCP and Plugins changes may register projection
or availability metadata without changing their existing owner boundaries or
verifier semantics.

### Phase 4: Future Runtime Support

Adding another runtime requires a runtime projection adapter and capability
manifest update. It must not fork the registry/store logic or introduce a second
install truth.

## Risks / Trade-offs

- **Projection could become a second capability manifest.** Mitigation:
  capability class support stays in `agent-runtime-capabilities`; per-package
  availability stays in the projection service.
- **Skill projection could leak unmanaged global content into isolated runs.**
  Mitigation: Codex isolated homes receive only Locus-managed eligible skill
  records.
- **MCP and plugin semantics could be weakened by a shared term.** Mitigation:
  projection availability never replaces MCP verified usability or plugin
  runtime-native activation identity.
- **Projection requirements could run ahead of adapters.** Mitigation: callers
  consume projection availability only for capability kinds with registered
  projection adapters; Phase 1 registers Skills only.
- **Broad implementation could collide with active MCP work.** Mitigation:
  implementation starts after `add-mcp-registry-install` lands or is explicitly
  deferred, and Phase 1 is Codex registry skill projection only.

## Verification

- Unit tests:
  - registry-managed skill install creates canonical metadata
  - projection selects only eligible Codex registry skills
  - unmanaged global Codex skills are not projected into isolated homes
  - modified/update state remains separate from availability state
- Integration tests:
  - Codex isolated home preparation includes selected registry-managed skills
  - Codex isolated home preparation excludes unrelated global skills
  - runtime availability reports unavailable when projection is absent
- Smoke:
  - install a registry-managed Codex skill
  - start or prepare a managed Codex run
  - prove the isolated `CODEX_HOME/skills` contains the expected skill
  - record that UI/runtime status distinguishes installed from available
