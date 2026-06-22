# Change: Add Agent native projection writes

## Status

**Deferred — parked proposal. Do not implement yet.** (As of 2026-06-22.)

This change is intentionally not scheduled. The parent archived change
`add-agent-builder-runtime-projection` already makes current behavior honest:
Locus Agents are canonical, runtime-native and plugin-provided agent listings are
read-only, prompt-context support is labeled as prompt-only, and Locus does not
claim native Agent execution or write runtime-native agent files.

Implement only when ALL of the following are true:
- The read-only Agent Builder surface has stayed stable enough to add write
  actions without reopening source ownership.
- The target runtime has a stable native Agent primitive and adapter-owned smoke
  evidence.
- Import, duplicate, drift, conflict preview, rollback, and provenance UX are
  approved together.
- The first write target is a Locus-managed isolated runtime home; durable writes
  to user-managed runtime directories remain blocked until a later approved
  change defines ownership markers and rollback evidence for those directories.

## Why

Agent Builder now aggregates Locus Agents, runtime-native discovered agents, and
plugin-provided agents without making external sources editable. The next write
step needs a separate explicit change so import, duplicate, native
materialization, and runtime-directory write boundaries do not get mixed with
the read-only aggregation slice.

## What Changes

- Add explicit "Import as Locus Agent" and "Duplicate to Locus Agent" flows that
  preserve provenance instead of editing runtime-owned or plugin-owned sources in
  place.
- Add projection records for prompt-context availability where the current
  runtime support DTO needs durable projection state.
- Add native Agent materialization only for Locus-managed isolated runtime homes
  after compatibility, discovery, drift checks, and runtime-specific smoke proof
  exist.
- Keep Codex native projection blocked until a stable native primitive and smoke
  evidence exist.
- Keep writes to user-managed `~/.claude/agents`, project `.claude/agents`, or
  other runtime-owned directories blocked pending a later approved change.

## Impact

- Affected specs: `agent-builder`, `runtime-capability-projection`
- Affected code:
  - `src/main/lib/agent-builder/**` import, duplicate, and projection
    orchestration
  - `src/main/lib/runtime-capability-projection/**` Agent projection records,
    fingerprints, and availability proof
  - Runtime-specific Claude/Codex adapters only after the runtime primitive is
    stable and proven
  - Agent Builder UI actions, conflict previews, and sanitized diagnostics
  - Tests and smoke proof for import, duplicate, prompt-context records, native
    materialization, write refusal, and rollback paths
