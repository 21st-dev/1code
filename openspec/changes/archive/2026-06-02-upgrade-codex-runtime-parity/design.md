## Context
Locus currently has Claude and Codex runtime paths, but Claude Code is the path with stronger product assumptions around tool gating, plan mode, session behavior, and runtime-specific feature surfaces. `add-headless-agent-jobs` introduces an `AgentRuntime` contract that can expose Codex honestly, including `degraded` and `unsupported` capability states. This change is the follow-up that turns Codex gaps into implemented behavior where Locus presents a runtime-neutral experience.

## Goals / Non-Goals
- Goals:
  - Make Codex first-class for the runtime capabilities Locus exposes as shared product behavior.
  - Prove hard safety claims with pre-execution enforcement, not prompt-only instructions.
  - Keep capability declarations tied to tests and real adapter behavior.
  - Preserve local-first and credential boundaries.
  - Keep desktop and future headless callers consuming the same capability truth.
  - Bring the existing desktop Codex chat path under the same enforcement and capability truth as headless/CLI callers.
- Non-goals:
  - Building the local job platform itself.
  - Copying Codex CLI, Claude Code, ACP, Goose, or another runtime wholesale.
  - Treating Claude-only research-preview features as runtime-neutral without a Codex equivalent or explicit rescope.

## Capability Groups

### Core Safety Parity
Codex must reach `supported` for:
- `hardToolGuard`
- `planMode`
- `scopeExpansion`
- `askUserQuestion`
- `rollback`
- `mcpAuth`

These capabilities protect user intent, write boundaries, and interactive control. They should be implemented before claiming Codex is safe for the same guarded agent workflows as Claude.

### Runtime Feature Parity
Codex must reach equivalent user-facing behavior for:
- `mcpConfiguration`
- `providerProfiles`
- `attachments`
- `usageMetadata`
- `runtimePlugins`
- `runtimeCommands`
- `runtimeWorkflows`
- `appAgents`

Feature parity does not require identical upstream primitives. A runtime-native Codex implementation and a Locus-owned shared layer are both acceptable. Prompt injection, documentation-only entries, installed/read-only visibility, or UI labels without execution paths are not enough.

### Platform Runtime Status
Codex must expose distinct, non-secret availability states for:
- bundled Codex CLI availability
- bundled ACP runtime availability and spawn probes
- Codex login or API-key state
- selected provider profile availability
- MCP auth and MCP configuration readiness
- local-only or policy blockers

These states should be visible to desktop and headless callers before provider work starts. A single generic "Codex failed" state is not enough for platform-level runtime behavior.

## Decisions

### Separate From Headless Jobs
Decision: keep Codex parity as a dedicated OpenSpec change.

Why: headless jobs only need a truthful runtime contract and caller gating. Requiring full Codex parity would block job persistence, CLI command dispatch, and desktop job visibility on a much larger runtime upgrade.

### Supported Means Enforced
Decision: Codex may report a capability as `supported` only when the adapter or a Locus-owned shared layer enforces or provides the behavior.

Why: UI similarity and prompt-only instructions are not equivalent to a runtime capability. This is especially important for hard tool guards, plan mode, scope expansion, and AskUserQuestion flows.

### Existing Desktop Chat Is In Scope
Decision: the current interactive Codex chat path must either call the shared `AgentRuntime` Codex adapter or delegate to the same enforcement/status layer used by the adapter.

Why: a new headless runner can pass parity tests while the user's real desktop chat still uses a router-specific prompt-only or audit-only path. Codex is not platform-level until the existing desktop route consumes the same capability truth.

### Availability Is Not A Single Boolean
Decision: Codex runtime availability should be modeled as component-level status, not just `ok` or `failed`.

Why: bundled CLI problems, ACP spawn failures, login gaps, provider-profile errors, MCP needs-auth states, and local-only blocks lead to different user actions and must not be collapsed into one diagnosis.

### Keep Degraded States Visible During Development
Decision: degraded/unsupported Codex capability states remain valid during implementation, but not at this change's completion gate for parity-owned capabilities.

Why: honest intermediate states let desktop and CLI surfaces stay usable while making remaining gaps measurable.

### Rescope Instead Of Pretend
Decision: if a parity surface cannot be implemented safely, rescope it explicitly in OpenSpec rather than marking it supported.

Why: parity claims are product contracts. A rescope is clearer than shipping a false capability declaration.

### Feature Parity Boundary
Decision: this change completes Codex platform-runtime parity by supporting the runtime features that already have a real Codex execution path, and by explicitly keeping the remaining Claude-specific surfaces degraded or unsupported.

Supported in this change:
- Provider profiles: the renderer sends only provider-profile IDs; the main process resolves gateway tokens and redacts provider secrets.
- Attachments: Codex uses the same local image, long-text, and file-content send pipeline as the desktop chat path.
- Usage metadata: Codex emits normalized token/context metadata from session token-count events when available and omits unavailable fields.

Explicitly not claimed as supported in this change:
- MCP configuration remains degraded for project-scoped writes because the current Codex CLI exposes global add/remove behavior; list/status and needs-auth preflight still run through Codex status handling.
- Runtime plugins and runtime commands remain unsupported for Codex executable behavior; read-only discovery is not executable parity.
- Runtime workflows remain unsupported because the existing dynamic-workflow adapter is Claude-specific.
- App Agents remain degraded because Codex currently receives prompt-prepared App Agent context, not a runtime-neutral agent/skill execution layer.

Why: these surfaces are useful, but marking read-only listings, prompt injection, or Claude-only adapters as Codex-supported would recreate the false parity this change is intended to remove.

### Rollback/Fork Rescope
Decision: Codex rollback/fork remains unsupported until Locus has a durable Codex resume-at/fork primitive or a shared transcript replay layer that excludes discarded turns.

Why: the current ACP provider accepts an `existingSessionId`, but it does not expose Claude-equivalent `resumeSessionAt` or `forkSession` controls. Reusing the existing session after rollback would risk continuing from provider history that still includes messages the user removed.

## Risks / Mitigations
- Codex or ACP may not expose pre-tool interception hooks.
  - Mitigation: add a safe Locus-owned proxy/wrapper seam or keep the capability degraded until a viable enforcement path exists.
- Capability manifests can drift from adapter behavior.
  - Mitigation: add contract tests that exercise every Codex capability marked `supported`.
- Existing desktop chat can bypass the new runtime adapter.
  - Mitigation: add tests and desktop smoke that prove interactive Codex chat and headless/CLI callers use the same parity-owned enforcement/status behavior.
- Feature parity can expand into unrelated product work.
  - Mitigation: limit implementation to behavior already presented as runtime-neutral or necessary to stop false parity claims.
- Claude Dynamic Workflows may remain Claude-specific.
  - Mitigation: either keep workflow parity out of runtime-neutral surfaces, build a Codex equivalent, or add a separate rescope before completion.

## Phase Boundary
- Phase 1 is complete when supported Codex core safety parity passes tests and real desktop smoke, while rollback/fork stays honestly unsupported and hidden from parity claims.
- Phase 2 is complete when supported runtime feature surfaces pass tests and real desktop smoke, while MCP project-scoped writes, runtime plugins, runtime commands, runtime workflows, and App Agent runtime execution stay explicitly degraded or unsupported.
- The change is complete only when remaining unsupported Codex surfaces are explicitly rescoped or no longer presented as runtime-neutral parity requirements.
