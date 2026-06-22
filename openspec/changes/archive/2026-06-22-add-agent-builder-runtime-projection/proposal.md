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
- Add runtime projection semantics for Locus Agents: prompt-context application
  and read-only plugin/runtime-native listings are separate from future native
  materialization work.
- Require visible source and availability states: Locus, Claude native, Codex
  native, plugin-provided, prompt-only, native-loadable, needs setup, blocked,
  unsupported, or read-only as applicable.
- Define the guardrails that prevent silent bidirectional sync. Import,
  duplicate, native materialization, and durable projection writes are deferred
  to `add-agent-native-projection-writes`.
- Retire "Custom Agents" as a product-facing label. Claude file agents become a
  runtime-specific capability such as "Claude native agents" or "Claude
  subagents" when exposed.
- Keep existing runtime capability truth rules: prompt injection alone is not
  full runtime-native agent execution support.

## Sequencing Guard

This change is intentionally large and MUST ship in recoverable phases. The
archived implementation slice stops at product/spec alignment, canonical Agent
cleanup, cross-runtime prompt-context consistency, and a read-only Agent Builder
aggregation model. Import, projection writes, and native execution claims are
parked in `add-agent-native-projection-writes`.

## Impact

- Affected specs: `agent-builder` (new), `app-agents`,
  `runtime-capability-projection`
- Affected code, when implemented:
  - Agent Builder UI under Settings / capability center surfaces
  - `src/main/lib/app-agents/**` canonical Agent CRUD and prompt context
  - `src/main/lib/runtime-capability-projection/**` runtime availability
    reporting
  - Renderer mention providers and context recommendations
  - i18n dictionaries and architecture guards that prevent "Custom Agents" from
    returning as a product label
- Coordination: this should stay separate from
  `refactor-command-settings-ownership`; both may touch Settings IA but solve
  different ownership problems.
