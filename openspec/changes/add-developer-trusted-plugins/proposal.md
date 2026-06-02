# Change: Add developer trusted plugins

## Why
Locus now supports manifest-only plugins, update review, safe mode, Doctor/Debug, MCP gates, and controlled UI declarations. Advanced local users still need a way to run their own local plugin code for experiments and internal automation, but that mode must be explicitly separated from normal plugin browsing and marketplace trust.

## What Changes
- Add a Locus-native `developer-trusted-code` plugin mode for user-selected local directories.
- Add an explicit Developer Plugin Mode switch and per-plugin trust acknowledgement before any developer plugin code may load.
- Require the current plugin fingerprint to be locally reviewed and trusted before loading or invoking developer plugin code.
- Block developer plugin loading under plugin safe mode before any plugin entrypoint is imported.
- Add Doctor/Debug, settings UI, i18n copy, source guards, and tests that label developer plugins as full local code trust, not a sandbox.
- Keep developer trusted plugins out of ordinary plugin marketplace install/update flows.

## Impact
- Affected specs: `runtime-plugins`
- Affected code:
  - `src/shared/plugin-target-modes.ts`
  - `src/shared/plugin-safety-gates.ts`
  - `src/shared/plugin-doctor.ts`
  - `src/main/lib/plugins/*`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - `tests/plugin-*.test.ts`
