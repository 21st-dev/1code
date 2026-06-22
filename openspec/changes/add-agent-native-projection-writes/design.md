## Context

The archived `add-agent-builder-runtime-projection` slice made the product
vocabulary and read model honest: Locus Agents are canonical, runtime-native and
plugin-provided agents remain read-only, and prompt-context support does not
claim runtime-native execution.

This parked change covers the write side that was intentionally not shipped:
importing runtime-native definitions into Locus, duplicating plugin-provided
agents, recording prompt-context projection availability, and materializing a
Locus Agent into a runtime-native format for a managed run.

## Goals

- Preserve Locus Agent ownership while adding explicit copy-in flows.
- Add native materialization only where Locus owns the isolated runtime home for
  a managed run.
- Require runtime-specific proof before reporting native-loadable Agent support.
- Block writes into user-managed runtime directories until a later approved
  change defines ownership markers, drift handling, rollback, and smoke proof.

## Non-Goals

- Do not edit runtime-native or plugin-provided agents in place.
- Do not silently sync Locus Agents with runtime-owned files.
- Do not write to `~/.claude/agents`, project `.claude/agents`, or other
  user-managed runtime directories in this change.
- Do not claim Codex native Agent support before a stable Codex primitive exists.

## Decisions

### Decision: Import and duplicate are copy-in flows

Runtime-native discovered agents can be imported as new Locus Agents, and
plugin-provided agents can be duplicated as new Locus Agents. The source remains
external and read-only unless a later approved change defines a separate edit or
sync contract.

### Decision: Native materialization starts in isolated homes only

The first native projection implementation stages runtime-native Agent content
only inside Locus-managed isolated runtime homes used for managed runs. It must
not write to global or project runtime directories the user may manage outside
Locus.

### Decision: Native proof is runtime-specific

Prompt-context injection is useful, but it is not proof of native-loadable Agent
support. Native proof requires runtime-specific materialization, discovery from
the runtime's expected location, drift checks, and smoke evidence for that
runtime.

## Risks / Trade-offs

- Risk: Users may treat copied Agents as live sync with their source.
  Mitigation: import and duplicate copy provenance but do not create background
  sync.
- Risk: Native writes can overwrite user-managed runtime files.
  Mitigation: this change writes only to isolated runtime homes and blocks
  durable directory writes.
- Risk: Runtime proof can be overstated.
  Mitigation: native-loadable status requires adapter-owned materialization and
  smoke evidence; prompt injection remains prompt-only.
