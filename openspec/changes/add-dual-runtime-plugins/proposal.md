# Change: Add dual-runtime plugin visibility

## Why
Plugins are currently presented as one generic settings surface, but the implementation only discovers Claude Code plugins under `~/.claude/plugins/marketplaces/`. Users need the Plugins page to distinguish Claude Code and Codex plugin packages without implying that one runtime can automatically enable or execute the other's plugin format.

## What Changes
- Add runtime-aware plugin discovery for Claude Code and Codex plugin package roots.
- Update Settings > Plugins to filter and group plugins by runtime.
- Keep Claude Code plugin enable/disable controls scoped to Claude settings.
- Show Codex plugins as installed/read-only packages until a real Codex plugin enablement API exists.
- Require explicit user approval for Claude plugin MCP servers instead of approving them as a side effect of enabling a plugin.

## Impact
- Affected specs: `runtime-plugins`
- Affected code: `src/main/lib/plugins/index.ts`, `src/main/lib/trpc/routers/plugins.ts`, `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`
