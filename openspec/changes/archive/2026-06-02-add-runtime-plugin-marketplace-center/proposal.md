# Change: Add runtime plugin marketplace center

## Why
Codex and Claude Code now both expose their own plugin marketplace concepts, but Locus currently mixes three different ideas in Settings > Plugins: local runtime package discovery, Locus-native pinned store candidates, and runtime-owned marketplaces. This makes an empty Locus store look like the plugin ecosystem is empty, even when Codex or Claude Code have marketplace inventory available through their own runtimes.

## What Changes
- Add a runtime-scoped marketplace center that reads Codex marketplace/plugin inventory from Codex-owned command surfaces and Claude Code marketplace/plugin inventory from Claude-owned command surfaces.
- Present Codex, Claude Code, and Locus-native plugin store state as separate scopes instead of one cross-runtime marketplace.
- Keep the first slice read-only for external runtime marketplaces: list marketplaces, installed plugins, available plugins, status, version, path/source, and declared components when available.
- Keep runtime install/update/remove/enable/disable actions out of this slice until a later approved change defines command invocation, confirmation, rollback, and failure handling.
- Rename or clearly label the existing pinned `plugin-store-catalog.json` flow as a Locus-native pinned candidate store, not as the Codex or Claude marketplace.
- Extend Doctor/Debug to report runtime CLI availability, marketplace command failures, stale filesystem fallbacks, and source-of-truth conflicts without executing plugin code.

## Impact
- Affected specs: `runtime-plugins`
- Affected code:
  - `src/shared/plugin-store-pins.ts`
  - `src/main/lib/plugins/index.ts`
  - `src/main/lib/plugins/store-pins.ts`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - plugin marketplace and Doctor tests under `tests/`

## Source Notes
- Codex official docs describe plugins as bundles of skills, app integrations, and MCP servers, and document marketplace setup plus `codex plugin marketplace add/list/upgrade/remove`.
- Claude Code official docs describe `/plugin` marketplace discovery, `claude plugin` management commands, marketplace add/list/update/remove, install scopes, and auto-update behavior.
