# Change: Add Plugin Sources Browser

## Why
Settings > Plugins can now show Claude Code and Codex plugin packages, but users still cannot see where those packages are coming from. A lightweight source browser gives the same orientation value as the Skills registry without turning Plugins into a full remote marketplace.

## What Changes
- Add a read-only Plugin Sources view under Settings > Plugins.
- Show runtime, path, source type, trust label, status, plugin count, and install guidance for each known source.
- Keep source browsing local/cache-based only; do not add remote search, install, update, or enablement actions.

## Impact
- Affected specs: runtime-plugins
- Affected code: `src/main/lib/plugins/index.ts`, `src/main/lib/trpc/routers/plugins.ts`, `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`, `src/renderer/lib/i18n/dictionaries.ts`
