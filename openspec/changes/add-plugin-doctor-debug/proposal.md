# Change: Add plugin Doctor and Debug gates

## Why
Locus now records plugin manifest fingerprints and enforces safe-mode/review gates for plugin MCP paths, but users still do not have a single Doctor/Debug view that explains plugin health, review blockers, and runtime gate decisions. Non-MCP plugin components also need to use the same fail-closed gate before later controlled UI or marketplace work can build on this safely.

## What Changes
- Add a Locus-native plugin Doctor report that summarizes source, manifest, review, safe-mode, component, MCP, and data-state checks without executing plugin code.
- Add per-plugin Debug details in Settings > Plugins so users can see why a plugin is blocked, reviewed, changed, read-only, or safe-mode disabled.
- Gate plugin-provided commands, skills, and agents on the current reviewed fingerprint and global plugin safe mode, matching the MCP gate posture.
- Keep Doctor/Debug local-only and redacted; do not install, update, patch, run arbitrary plugin code, or treat Codex++ permissions as a sandbox.

## Impact
- Affected specs: `runtime-plugins`
- Affected code:
  - `src/shared/plugin-doctor.ts`
  - `src/main/lib/plugins`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/main/lib/trpc/routers/commands.ts`
  - `src/main/lib/trpc/routers/skills.ts`
  - `src/main/lib/trpc/routers/agents.ts`
  - `src/main/lib/trpc/routers/agent-utils.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - plugin/i18n/source-guard tests
