# Change: Add Claude Dynamic Workflows Adapter

## Why
Claude Code now exposes dynamic workflows as a research-preview runtime feature for large parallel subagent work. Locus already bundles a compatible Claude Code runtime, but it does not make workflows visible, controllable, or safe inside the local-first desktop chat surface.

Locus should adapt the Claude Code capability with a thin, runtime-scoped layer instead of turning it into a Locus-wide workflow engine.

## What Changes
- Add a Claude Code-specific dynamic workflow adapter that detects support, applies user settings, and keeps workflow behavior scoped to the Claude runtime.
- Add an explicit `Off` / `Ask` / `Allow` setting for Claude dynamic workflows, defaulting to `Ask`.
- Preserve Claude-owned workflow triggers and commands such as `workflow` prompts, `/deep-research`, `/workflows`, and `/effort ultracode` instead of expanding them as Locus slash-command templates.
- Require Locus approval before a Claude workflow starts when the setting is `Ask`, including workflow name, phase/script summary when available, write-risk warning, and usage warning.
- Normalize Claude workflow/background task events into Locus chat UI chunks so users can see running workflow progress and final results.
- Support stop/cancel through the existing Claude abort path for the first slice.
- Keep pause/resume, save workflow, durable job persistence, Locus CLI/daemon/scheduler integration, and Codex parity out of this change.

## Impact
- Affected specs: `claude-dynamic-workflows` (new)
- Affected code:
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/main/lib/claude/transform.ts`
  - `src/main/lib/claude/env.ts`
  - new `src/main/lib/claude-workflows/**`
  - `src/renderer/features/agents/**`
  - `src/renderer/components/dialogs/settings-tabs/**`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - focused tests under `tests/`

## References
- Claude Dynamic Workflows docs: https://code.claude.com/docs/en/workflows
- Claude Dynamic Workflows announcement: https://claude.com/blog/introducing-dynamic-workflows-in-claude-code

## Non-Goals
- Do not implement a generic Locus workflow engine.
- Do not execute or parse workflow JavaScript outside Claude Code's own runtime.
- Do not persist workflow runs as Locus `agent_jobs` in this change.
- Do not add `locus run`, daemon, schedule, or ACP support here.
- Do not claim full parity with Claude Code Desktop's `/workflows` UI in the first slice.
- Do not enable workflows for Codex or custom Claude-compatible providers unless a later proposal defines that behavior.
