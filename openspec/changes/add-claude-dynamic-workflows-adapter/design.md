## Context
Locus is a local-first Electron desktop app. The Claude chat path runs through the main process, uses the Claude Agent SDK, and passes the bundled Claude Code executable to the SDK. The current app can already invoke a Claude Code version new enough for dynamic workflows, but the renderer has no workflow-specific approval, progress, or settings surface.

Claude's public documentation describes dynamic workflows as a research-preview feature that:
- requires Claude Code `v2.1.154` or later,
- can be triggered by workflow prompts, bundled commands such as `/deep-research`, and `ultracode`,
- can be disabled through `CLAUDE_CODE_DISABLE_WORKFLOWS=1`,
- runs many subagents and can consume substantially more usage,
- has limits such as bounded concurrency and no mid-run user input except agent permission prompts.

The risky Locus-specific detail is that the current Agent mode uses Claude SDK permission bypass behavior for normal tool execution. That is acceptable only if Locus adds its own workflow launch approval and keeps the feature scoped to Claude Code.

## Goals / Non-Goals
- Goals:
  - Adapt Claude Code dynamic workflows through a small Claude-specific module.
  - Default to explicit user consent before workflows run.
  - Preserve local-first and credential boundaries.
  - Surface workflow progress in the existing chat UI.
  - Keep stop/cancel behavior aligned with existing Claude abort behavior.
- Non-goals:
  - Generic workflow execution outside Claude Code.
  - Deep integration with `add-headless-agent-jobs`.
  - Durable job storage, CLI job management, local daemon, local schedules, or ACP.
  - Recreating Claude Code Desktop's full `/workflows` management UI.
  - Making workflows appear as a Codex or custom-provider feature.

## Proposed Architecture

### Claude workflow adapter module
Add `src/main/lib/claude-workflows/`:
- `support.ts`: detects bundled Claude version support and reports whether workflows are available, disabled by user setting, disabled by environment, or blocked by runtime/provider state.
- `settings.ts`: resolves the local workflow setting: `off`, `ask`, or `allow`. The default is `ask`.
- `env.ts`: applies workflow disablement by injecting `CLAUDE_CODE_DISABLE_WORKFLOWS=1` when the resolved setting is `off` or when support is unavailable.
- `approval.ts`: maps Claude `Workflow` tool calls into Locus approval requests and caches "always for this project/workflow" decisions without storing provider secrets.
- `events.ts`: normalizes Claude workflow and background task system messages into renderer-safe workflow events.

This module remains Claude-specific. It may import shared UI event types, but it must not import or depend on the future headless job store.

### Runtime integration
Update `src/main/lib/trpc/routers/claude.ts` at the existing SDK query boundary:
- Resolve dynamic workflow support and settings before starting the SDK query.
- Inject the disable environment variable when workflows are off or unsupported.
- Intercept `Workflow` tool calls in `canUseTool`.
- If setting is `ask`, emit an approval request to the renderer and deny the tool call on timeout or user denial.
- If setting is `allow`, start without per-run approval but still emit a visible workflow-started event.
- If setting is `off`, deny workflow launch with a clear local error.
- Ensure Plan mode and guarded-run constraints remain enforceable for workflow-spawned tool calls; if the SDK does not expose enough permission hooks for spawned agents, disable workflows for that mode with a clear message.

### Slash command and prompt handling
Keep Claude-owned workflow commands as runtime commands:
- `/deep-research`
- `/workflows`
- `/effort ultracode`
- user prompts containing `workflow`
- saved workflow commands from `.claude/workflows/` and `~/.claude/workflows/`

The Locus slash-command expander must not replace these commands with local prompt templates. The command guide may list them as Claude Code runtime commands with a research-preview label.

### Renderer UI
Add a compact workflow card in the existing assistant message stream:
- Pending approval state with name, phase/script summary when available, usage warning, write-risk warning, and `Once`, `Always`, `Deny`.
- Running state with workflow name, status, phase/agent counts when available, elapsed time when available, and Stop.
- Finished/failed/canceled state with final status and a link to final output within the same chat message.

This UI is intentionally a status card, not a full `/workflows` management surface.

### Settings
Add a Claude-specific Dynamic Workflows setting near Claude runtime/model settings:
- `Ask` default: require approval for each workflow launch unless a project/workflow allow decision exists.
- `Allow`: workflows may start without approval, still visible in chat.
- `Off`: Locus disables workflows for Claude runs via environment and denies any observed Workflow tool call.

The setting must make the research-preview and usage-cost nature clear. It must not present dynamic workflows as a Locus-native job system.

### Security and local-first boundaries
- Do not expose Claude OAuth tokens or provider secrets to the renderer.
- Do not accept provider tokens in workflow settings.
- Do not write workflow scripts or run records into Locus durable job tables in this change.
- Do not bypass local-only guards because a workflow is running.
- Do not label a workflow as read-only unless Locus can enforce read-only tool permissions for all workflow-spawned work.

## Decisions

### Adapter before platform integration
Decision: build a Claude-specific adapter first and keep it out of the Locus headless job platform.

Why: dynamic workflows are a Claude runtime feature in research preview. Integrating them directly into Locus jobs, CLI, daemon, or scheduler would make a runtime-specific feature look like a stable Locus platform contract.

### Default to Ask
Decision: default dynamic workflows to `Ask`.

Why: workflows can spawn many agents and use substantially more tokens. Locus Agent mode currently uses permissive execution settings, so Locus must provide its own launch consent before long-running parallel work starts.

### Event visibility without durable ownership
Decision: normalize workflow events for the current chat UI, but do not persist workflow runs as Locus jobs.

Why: Claude Code owns workflow execution, caching, and same-session resume semantics. Locus should surface useful state without becoming the source of truth for the workflow runtime.

### Stop only in MVP
Decision: support Stop through the existing abort controller, but defer pause/resume/save.

Why: the existing Locus Claude path already has cancellation behavior. Pause/resume/save require deeper workflow state mapping and should follow after event visibility is proven.

## Risks / Mitigations
- Workflow event shapes may change while the feature is in research preview.
  - Mitigation: isolate parsing in `claude-workflows/events.ts`, preserve unknown events in logs, and degrade to a generic running card.
- `Workflow` tool permission hooks may not cover every spawned-agent operation.
  - Mitigation: add tests with mocked SDK messages and disable workflows in modes where Locus cannot enforce its safety claims.
- Users may confuse Claude workflows with Locus jobs.
  - Mitigation: label the feature as Claude Code Dynamic Workflows and keep it out of the Agent Workbench job model until a later proposal.
- Cost can spike unexpectedly.
  - Mitigation: default to `Ask`, show usage warnings, and keep `ultracode` in advanced/runtime-command surfaces only.

## Phase Boundary
- Phase 1 is complete when Locus can detect support, gate workflows with settings, approve or deny `Workflow` tool launches, show workflow progress/final state in chat, and stop active workflows.
- Phase 2 may add richer `/workflows` browsing and save/re-run affordances after the MVP proves stable.
- Any durable job, CLI, daemon, schedule, or protocol integration requires a separate proposal or a deliberate extension to `add-headless-agent-jobs`.
