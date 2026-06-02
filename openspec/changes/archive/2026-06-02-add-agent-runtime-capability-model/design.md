## Context
Locus currently has mature runtime-specific paths for Claude Code and Codex, with work underway for local headless jobs and Claude dynamic workflows. The previous Codex parity work made Codex a first-class runtime for implemented safety and integration paths, but it also showed that runtime parity must be capability-driven: some behaviors are available through Claude Code primitives, some through Codex/ACP primitives, and some only through Locus-owned shared layers.

This change separates the platform rule from any single feature. Headless jobs, workflow adapters, plugins, commands, and App Agents should consume a shared capability model instead of redefining whether Claude and Codex must be equal.

## Goals / Non-Goals
Goals:
- Define runtime capability manifests as the source of truth for supported, degraded, and unsupported behavior.
- Support both runtime-neutral and runtime-specific features.
- Allow Claude-only and Codex-only capabilities without forcing the other runtime to emulate them.
- Prevent prompt-only or UI-only parity claims from being marked `supported`.
- Provide a clear dependency boundary for `add-headless-agent-jobs`.

Non-goals:
- Implement the full agent runner, job runner, `locus run` CLI, protocol server, or a complete runtime capability center UI.
- Add provider presets or provider diagnostics.
- Force Codex to match Claude Code feature-for-feature.
- Force Claude Code to match Codex feature-for-feature.
- Implement rollback/fork, workflows, plugins, commands, MCP project writes, or App Agent execution.

## Decisions

### Capability Scope
Decision: each capability is classified as `runtime-neutral`, `runtime-specific`, or unavailable for the selected runtime.

Why: shared UI and jobs need common behavior where it exists, while runtime-owned features such as Claude dynamic workflows or Codex ACP-specific behavior should remain usable without pretending every runtime supports them.

### Capability State
Decision: each runtime reports `supported`, `degraded`, or `unsupported` for every capability it exposes to callers.

Why: callers need a predictable gate before provider work starts. `degraded` keeps partial, prompt-assisted, read-only, or discovery-only behavior visible without overclaiming safety or execution semantics.

### Support Evidence
Decision: `supported` requires runtime code that enforces or provides the behavior through a stable runtime primitive or a Locus-owned shared layer.

Why: UI labels, indexed docs, prompt instructions, and post-run audit can help users, but they do not provide the same safety or execution guarantees as a real runtime control point.

### Runtime-Specific Features
Decision: Claude-only or Codex-only features may be first-class, but they must be labeled and gated as runtime-specific.

Why: Locus is a multi-runtime platform, not a feature equalizer. The right outcome is honest availability, not lowest-common-denominator UX or fake parity.

## Risks / Trade-offs
- Risk: capability manifests become broad and hard to keep current.
  - Mitigation: require tests or smoke evidence when a capability is marked `supported`, and require reasons for `degraded` or `unsupported`.
- Risk: users see more disabled controls.
  - Mitigation: disabled/degraded states should include concise reasons and next-step hints.
- Risk: `add-headless-agent-jobs` duplicates capability definitions.
  - Mitigation: after this change is approved, update the headless jobs proposal to depend on this spec rather than own the model.

## Migration Plan
1. Add the standalone spec.
2. Validate the OpenSpec change.
3. After approval, implement a shared capability manifest type and registry seam.
4. Update `add-headless-agent-jobs` to consume this spec.
5. Keep existing runtime-specific code paths working while gradually replacing provider-name gates with capability gates.

## Resolved Implementation Choices
- Capability IDs are fixed in one shared enum for this first implementation.
- Runtime-neutral, runtime-specific, and unavailable capabilities appear in the same manifest with explicit scope and state.
- Manifest copy is limited to non-secret labels, reasons, and remediation hints; broader localized UI copy remains outside the manifest.
