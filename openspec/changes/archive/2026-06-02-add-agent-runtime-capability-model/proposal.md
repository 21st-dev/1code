# Change: Add Agent Runtime Capability Model

## Why
Locus is becoming a multi-runtime desktop app, but runtime planning still mixes two different ideas: runtime-neutral behavior that every selected runtime can safely provide, and runtime-specific behavior that only Claude Code, Codex, or a future runtime exposes through its own CLI, SDK, or protocol primitives.

Without a standalone capability model, follow-up work such as headless jobs, dynamic workflows, plugins, commands, and App Agents can accidentally require Claude/Codex feature parity where none exists, or hide runtime-specific strengths behind provider-name branches.

## What Changes
- Add a standalone `agent-runtime-capabilities` spec for runtime capability manifests.
- Define runtime capability states: `supported`, `degraded`, and `unsupported`.
- Define capability scopes: runtime-neutral, runtime-specific, and unavailable.
- Require `supported` capabilities to be backed by runtime code, a stable runtime primitive, or a Locus-owned shared layer.
- Require prompt-only guidance, read-only discovery, indexed documentation, and UI similarity to remain `degraded` or `unsupported`.
- Require UI, CLI, jobs, and protocol callers to gate runtime behavior from capability manifests instead of assuming Claude and Codex are feature-equivalent.
- Make `add-headless-agent-jobs` a consumer of this model rather than the owner of the model.

## Impact
- Affected specs: `agent-runtime-capabilities`
- Related active changes: `add-headless-agent-jobs`, `add-claude-dynamic-workflows-adapter`
- Affected future code: `src/main/lib/agent-runtime/`, runtime registries, Claude and Codex adapters, renderer runtime controls, CLI/job/protocol gates
- No product code is implemented in this change until the proposal is approved.
