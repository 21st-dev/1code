# Change: Add Agent Builder and runtime projection direction

## Why

Locus currently exposes App Agents as app-managed prompt/tool profiles, while
Claude-native `.claude/agents` files, plugin-provided agents, and future Codex
subagent primitives can appear as adjacent "agent" concepts. Users should not
need to understand those internal storage and runtime differences before choosing
what to use.

The long-term product direction is a single Agent Builder surface: App Agents are
the canonical Locus-owned Agent records, and runtime-native agents are discovered,
imported, or projected through explicit runtime availability and proof states.

## What Changes

- Add an Agent Builder product capability that unifies agent discovery,
  creation, editing, runtime support status, diagnostics, and invocation under
  one user-facing Agent concept.
- Keep App Agents as the canonical Locus Agent source of truth rather than
  merging Claude-native, Codex-native, and plugin-provided agents into one
  mutable table.
- Add runtime projection semantics for Locus Agents: prompt-context application,
  Claude-native agent materialization, future Codex-native subagent materializing,
  and read-only plugin/runtime-native listings are separate projection modes.
- Require visible source and availability states: Locus, Claude native, Codex
  native, plugin-provided, prompt-only, native-loadable, needs setup, blocked,
  unsupported, or read-only as applicable.
- Define import and projection flows instead of silent bidirectional sync:
  runtime-native agents can be imported as Locus Agents, and Locus Agents can be
  projected into runtime-native formats only with explicit user intent and drift
  diagnostics.
- Retire "Custom Agents" as a product-facing label. Claude file agents become a
  runtime-specific capability such as "Claude native agents" or "Claude
  subagents" when exposed.
- Keep existing runtime capability truth rules: prompt injection alone is not
  full runtime-native agent execution support.

## Sequencing Guard

This change is intentionally large and MUST ship in recoverable phases. The
first implementation slice should stop at product/spec alignment, canonical
Agent cleanup, cross-runtime prompt-context consistency, and a read-only Agent
Builder aggregation model. Import, projection writes, and native execution
claims belong to later slices after the read model is stable.

The first native materialization implementation MUST write only into
Locus-managed isolated runtime homes for managed runs. Writing to user-managed
runtime directories such as `~/.claude/agents` or project `.claude/agents`
requires a later approved change with conflict previews, drift detection, and
rollback evidence.

## Impact

- Affected specs: `agent-builder` (new), `app-agents`,
  `runtime-capability-projection`
- Affected code, when implemented:
  - Agent Builder UI under Settings / capability center surfaces
  - `src/main/lib/app-agents/**` canonical Agent CRUD and prompt context
  - `src/main/lib/runtime-capability-projection/**` projection records and
    runtime availability reporting
  - Claude runtime isolated config preparation for optional native agent
    projection
  - Codex runtime adapter only after a stable native subagent path is proven
  - Renderer mention providers and context recommendations
  - i18n dictionaries and architecture guards that prevent "Custom Agents" from
    returning as a product label
- Coordination: this should stay separate from
  `refactor-command-settings-ownership`; both may touch Settings IA but solve
  different ownership problems.
