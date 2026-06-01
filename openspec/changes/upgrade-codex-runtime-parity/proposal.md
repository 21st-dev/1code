# Change: Upgrade Codex runtime parity

## Why
`add-headless-agent-jobs` introduces a shared runtime contract and local job platform, but it should not be blocked on making Codex behavior-equivalent to Claude Code. Codex still needs a dedicated parity track so Locus can treat it as a first-class runtime without hiding gaps behind provider-specific UI or prompt-only safety.

## What Changes
- Upgrade the Codex adapter from an honest capability participant to a behavior-equivalent runtime target for the capabilities Locus exposes as runtime-neutral.
- Implement core safety parity for hard tool guard, plan mode enforcement, scope expansion approval, AskUserQuestion, rollback/fork, and MCP auth.
- Implement feature parity for MCP configuration scope, provider profiles, attachments, usage metadata, runtime plugins, runtime commands, runtime workflows, and App Agents/skills.
- Add runtime contract tests and real desktop smoke tests that prove Codex capabilities marked `supported` execute through enforcement paths rather than prompt text, read-only visibility, or documentation-only shims.
- Keep unsupported or still-research surfaces visibly gated until they are implemented or explicitly rescoped.

## Impact
- Affected specs:
  - `codex-runtime-parity` (new)
  - `agent-runtime-core`
  - `runtime-plugins`
  - `command-guide`
  - `app-agents`
  - `usage-panel`
  - `claude-dynamic-workflows`
- Affected code:
  - `src/main/lib/agent-runtime/**`
  - `src/main/lib/agent-runtime/codex-adapter.ts`
  - `src/main/lib/trpc/routers/codex.ts`
  - `src/main/lib/trpc/routers/claude.ts` where parity tests need shared behavior references
  - `src/main/lib/trpc/routers/**` for MCP, plugin, command, App Agent, usage, and attachment surfaces
  - `src/renderer/features/agents/**`
  - `src/renderer/components/dialogs/settings-tabs/**`
  - focused tests under `tests/`
- Validation:
  - `openspec validate upgrade-codex-runtime-parity --strict --no-interactive`
  - focused tests proving Codex declared capabilities are enforced
  - desktop smoke covering guarded tool denial, plan mode denial, scope expansion, AskUserQuestion, rollback/fork, MCP auth/config, plugin/command/workflow/App Agent behavior, usage/provider metadata, and attachments

## Dependencies
- Depends on the `AgentRuntime` contract and capability manifest shape from `add-headless-agent-jobs`.
- May be implemented after `add-headless-agent-jobs` lands, or in parallel only if both changes keep their completion gates separate.

## Non-Goals
- Do not implement the headless job store, `locus run`, `locus jobs`, daemon, schedules, or ACP server in this change.
- Do not make Claude Dynamic Workflows generic unless this change deliberately adds a Codex-equivalent workflow path or a shared Locus-owned workflow layer.
- Do not claim parity from matching UI labels, prompt text, indexed documentation, or post-run audit alone.
- Do not expose provider secrets to the renderer or accept provider tokens in CLI/UI settings.
