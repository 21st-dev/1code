# Change: Add plugin safe mode gates

## Why
Locus can now classify plugin target modes and record local update-review fingerprints, but review state is still mostly advisory. Plugin-provided capabilities should fail closed when the plugin is new, changed, or when global plugin safe mode is enabled.

## What Changes
- Add a local plugin safe-mode switch that blocks plugin-provided runtime capabilities without deleting plugin metadata or review state.
- Gate Claude plugin enablement and plugin MCP runtime inclusion on the current reviewed manifest fingerprint.
- Prevent Locus-managed Claude agent runs from exposing the user plugin directory while plugin safe mode is enabled.
- Show review-gate state in Settings > Plugins so users can tell why plugin capabilities are blocked.
- Keep Codex packages read-only and do not add plugin code execution, app patching, marketplace install, or developer trusted-code support.

## Impact
- Affected specs: `runtime-plugins`
- Affected code:
  - `src/shared/plugin-update-review.ts`
  - `src/main/lib/plugins/update-review-state.ts`
  - `src/main/lib/plugins/index.ts`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/main/lib/trpc/routers/claude-settings.ts`
  - `src/main/lib/trpc/routers/claude.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - `tests/`
