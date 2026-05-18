# Change: Add dual-runtime skill installs

## Why
Skills are currently managed as Claude Code assets under `~/.claude/skills`, while Codex uses a separate `~/.codex/skills` tree. Users need a clear way to install registry skills for Claude Code, Codex, or both without assuming one CLI can see the other's directory.

## What Changes
- Add runtime-aware registry status and install operations for Claude Code and Codex.
- Show per-runtime installation state in Settings > Skills.
- Allow explicit install/update actions for Claude, Codex, or both from the registry view.
- Keep package verification, overwrite confirmation, and rollback behavior scoped to the selected runtime.

## Impact
- Affected specs: `skill-registry`
- Affected code: `src/main/lib/skills/registry.ts`, `src/main/lib/trpc/routers/skills.ts`, `src/renderer/components/dialogs/settings-tabs/agents-skills-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`
