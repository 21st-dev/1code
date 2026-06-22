## Context

The current shipped App Agents capability stores `app_agents` in SQLite and uses
`@[agent:name]` mention tokens as reusable prompt/tool guidance. The app also has
Claude-compatible file-agent utilities for `.claude/agents`, plugin agents can be
discovered through plugin component paths, and runtime capability inventory notes
future Codex subagent behavior.

Those are not the same product object:
- A Locus App Agent is an app-managed reusable work persona.
- A Claude native agent is a runtime-owned file format and discovery mechanism.
- A Codex subagent is a runtime-owned primitive only when a stable adapter exists.
- A plugin-provided agent belongs to a plugin package and may be read-only.

The product should present one primary Agent concept without hiding runtime
truth. The system should show what can be used where, how it is applied, and why
an agent is unavailable for a selected runtime.

## Goals

- Make Locus Agents the canonical product object for user-created reusable
  personas.
- Provide one Agent Builder surface for creating, inspecting, importing,
  projecting, and diagnosing agents.
- Distinguish source ownership from runtime availability.
- Allow runtime-native support without requiring every runtime to emulate every
  other runtime.
- Prevent silent two-way sync between Locus records and runtime global files.
- Keep provider secrets, OAuth material, runtime logs, and raw plugin code out of
  renderer-visible diagnostics.

## Non-Goals

- Do not merge every runtime-native agent source into a single mutable table.
- Do not remove Claude native agent compatibility merely because App Agents are
  canonical.
- Do not claim Codex native subagent support until a stable app-server or runtime
  primitive is implemented and proven.
- Do not make plugin-provided agents editable in place.
- Do not build hosted/background/remote agents as part of this change.
- Do not rename DB tables as part of the product vocabulary change.

## Decisions

### Decision: Product labels are ratified for implementation

The approved product vocabulary for this direction is:

- Agent Builder: the unified surface for creating, inspecting, importing,
  projecting, and diagnosing reusable agent personas.
- Locus Agent, or Agent when the Locus context is clear: the canonical
  app-managed record derived from the existing App Agents model.
- Claude native agents: Claude-owned `.claude/agents` definitions discovered or
  projected through explicit runtime capability state.
- Codex native agents: Codex-owned native subagent definitions, only after a
  stable runtime primitive is implemented and proven.
- Plugin-provided agents: read-only plugin-owned agent definitions unless the
  user duplicates them into a Locus Agent.
- Prompt-only mode: a useful but degraded projection mode that applies Agent
  instructions through prompt context without claiming runtime-native execution.

"Custom Agents" is not an approved product-facing category for this direction.
Existing storage keys, DB table names, and compatibility code may keep their
current names until a scoped migration changes them.

### Decision: Locus Agent is canonical

The product-facing Agent is a Locus-managed record derived from the existing App
Agent model. User-created and registry-imported agents live in the app-owned
store. Runtime-native records are external sources that can be imported or
projected, not hidden competing owners.

Alternatives considered:
- Merge runtime-native records into `app_agents`: rejected because runtime-owned
  formats have different lifecycle, scope, drift, permissions, and write
  semantics.
- Keep App Agents and Custom Agents as separate product tabs: rejected because it
  preserves the current vocabulary ambiguity.

### Decision: Agent Builder aggregates sources but does not erase provenance

The Agent Builder list can show Locus Agents, Claude native agents, Codex native
agents, and plugin-provided agents in one surface, but every row must retain a
source badge, owner, mutability, and runtime status.

### Decision: Runtime projection is explicit

A Locus Agent can be applied through prompt context or projected into a runtime
native format. Projection creates runtime availability state, not a new source of
truth. Drift, failed materialization, unsupported runtime primitives, and
missing setup must be visible before a run depends on that projection.

### Decision: Native import is copy-in, not sync-by-default

Runtime-native agents can be imported as Locus Agents. Import creates a new
Locus-owned record with provenance and does not keep silently overwriting either
side. Future bidirectional sync would require a separate approved change with
conflict handling.

### Decision: Prompt-only remains a first-class but degraded mode

Prompt-context application is useful and should remain available. It must be
labeled as prompt-only or degraded when the selected runtime lacks native agent
execution semantics.

### Decision: First native projection writes only isolated runtime homes

The first implementation that materializes Locus Agents into runtime-native
formats must stage them only inside Locus-managed isolated runtime homes used for
managed runs. It must not write to user-global or project runtime directories
such as `~/.claude/agents` or `.claude/agents`.

Writing to real user-managed runtime directories is a later product/security
change. That later change must prove ownership markers, drift detection,
conflict preview, rollback, and user confirmation before durable writes can
touch runtime assets the user may manage outside Locus.

## Proposed Ownership

- Canonical Locus Agent CRUD and prompt-context transformation:
  `src/main/lib/app-agents/**`
- Agent Builder aggregation/import/project orchestration:
  `src/main/lib/agent-builder/**` (new owner)
- Runtime projection state and availability:
  `src/main/lib/runtime-capability-projection/**`
- Runtime-native materialization adapters:
  runtime-specific modules under Claude/Codex adapter ownership
- Renderer views:
  Settings / capability center surfaces that consume DTOs and do not infer
  capability truth from runtime names or file paths

The implementation should update `docs/OWNERSHIP_MAP.md` before code introduces
long-lived `agent-builder` services.

## Data Model Direction

The existing `app_agents` table can remain the base canonical table. A later
implementation may add metadata needed for Agent Builder behavior, such as
source provenance, registry source, imported-from runtime, and projection
preferences. Runtime projection records should reference the Locus Agent id and
runtime id, and include fingerprints, status, non-secret reason text, and last
checked timestamps.

Runtime-native and plugin-provided listings should not be stored as editable
Locus Agents unless the user imports or duplicates them.

## Runtime Projection Modes

- `prompt-context`: inject Locus Agent instructions into the request.
- `native-materialized`: stage a runtime-native representation for a managed run
  in a Locus-managed isolated runtime home. Durable writes to user-managed
  runtime directories are out of scope for the first implementation.
- `native-discovered`: show a runtime-owned native agent that exists outside
  Locus canonical storage.
- `plugin-provided`: show a read-only agent supplied by a reviewed plugin.
- `unsupported`: show that no stable runtime path exists.

Exact enum names may change during implementation, but the UI must preserve the
distinction between prompt-only, native materialized, native discovered, and
plugin-provided.

## Migration Plan

1. Correct product vocabulary and audit docs: App Agents become Locus Agents /
   Agents; "Custom Agents" is retired as a label.
2. Remove or hide dead Custom Agent UI paths after proving they have no active
   callers.
3. Make `@[agent:name]` runtime behavior consistent: every supported runtime
   either receives prompt-context application or is gated with explicit reason.
4. Add Agent Builder read model that aggregates Locus Agents and read-only
   runtime-native/plugin listings.
5. Add explicit import-from-native and duplicate-from-plugin flows.
6. Add runtime projection state for Locus Agents, starting with prompt-context
   projection records.
7. Add native materialization only inside Locus-managed isolated runtime homes
   when proof is available.
8. Add durable writes to user-managed runtime directories only through a later
   approved change with conflict and rollback evidence.
9. Add Codex native subagent projection only after a stable primitive and smoke
   evidence exist.

## Risks / Trade-offs

- Risk: Users may interpret a single list as feature parity across runtimes.
  Mitigation: every row shows source, mutability, runtime status, and projection
  mode.
- Risk: Native file writes could overwrite user-managed runtime assets.
  Mitigation: first native projection writes only to Locus-managed isolated
  runtime homes; durable writes to user-global or project runtime directories
  require a later approved change with explicit projection enablement,
  fingerprints, conflict previews, and rollback-safe writes.
- Risk: Renderer code may infer runtime support from names or file paths.
  Mitigation: runtime support and projection status come from main-process
  owners and sanitized DTOs only.
- Risk: This becomes too large to ship.
  Mitigation: phase the work: vocabulary cleanup, prompt parity, read model,
  import, projection, runtime-native execution.

## Open Questions

- Should Claude native agent editing remain hidden, read-only, or available as
  an advanced runtime-specific action after import/export is implemented?
- What conflict preview and rollback UX is sufficient before a later change can
  write durable native agent files into user-managed runtime directories?
