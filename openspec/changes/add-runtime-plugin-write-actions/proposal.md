# Change: Add runtime plugin write actions

## Why
The runtime marketplace center can now show Codex and Claude Code plugin marketplace state, but users still have to leave Locus to run runtime-owned plugin commands. Locus should expose those runtime-native write actions without turning itself into a cross-runtime plugin installer or plugin execution host.

## What Changes
- Add confirmed write actions for Codex marketplace add/list/upgrade/remove and Codex plugin add/remove through the bundled Codex CLI.
- Add confirmed write actions for Claude Code marketplace add/list/update/remove and Claude plugin install/update/enable/disable/uninstall through the bundled Claude CLI.
- Add a main-process command preview and confirmation flow that builds exact argv from typed action inputs; the renderer never supplies raw command strings or arbitrary args.
- Refresh runtime marketplace inventory, plugin metadata, and Doctor after a successful write.
- Show Claude `/reload-plugins` guidance after Claude plugin mutations instead of trying to run chat slash commands from Locus.
- Keep Locus Store commit-pin installs separate from runtime-owned marketplace actions.

## Non-Goals
- No Codex plugin installed into Claude Code.
- No Claude Code plugin installed into Codex.
- No runtime plugin manifest conversion.
- No plugin JavaScript, hooks, native modules, MCP servers, app connectors, or developer trusted code execution in the Locus process.
- No Codex enable/disable buttons, because the bundled Codex CLI does not expose those actions.
- No automatic remote marketplace writes without explicit user confirmation.
- No storage of plugin marketplace credentials, tokens, or raw secret command output in renderer state.

## Impact
- Affected specs: `runtime-plugins`
- Affected code:
  - `src/shared/runtime-plugin-marketplace.ts`
  - `src/main/lib/plugins/runtime-marketplace.ts`
  - `src/main/lib/plugins/runtime-marketplace-actions.ts`
  - `src/main/lib/trpc/routers/plugins.ts`
  - `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`
  - `src/renderer/lib/i18n/dictionaries.ts`
  - runtime marketplace and UI guard tests under `tests/`
