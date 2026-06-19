## Why

Locus can discover and manage Claude Code and Codex plugin metadata, but
Locus-managed runs do not yet have a truthful, controlled plugin execution path.
Claude is currently partial because Locus removes the `plugins/` directory from the
isolated Agent SDK config and only injects reviewed plugin MCP servers. Codex is
currently unsupported because app-server plugin loading and per-run filtering are
not wired through Locus.

The target is not "the runtime can see plugins." The target is controlled
runtime-native plugin activation: each runtime may load its own plugins, but only
the plugins and components that Locus has allowed for the current managed run.

## What Changes

Locus SHALL activate installed, enabled, and reviewed Claude Code and Codex plugins
through each runtime's native plugin loader only when Locus can prove per-run
control. "Per-run control" means safe mode, review state, enablement, MCP approval,
runtime-native activation identity, and recovery gates can prevent an unreviewed,
drifted, disabled, unapproved, or failed plugin component from reaching the managed
run, even if that plugin is installed or enabled in the user's global runtime config.

Phased:

1. Research/proof produces a runtime-by-runtime activation matrix. For each
   component type, it must prove native loading, Locus control, and which stable
   runtime/package identity fields are available for drift detection.
2. Claude uses a filtered isolated config: reviewed plugin directory exposure plus
   filtered `settings.json`/activation state. Locus-managed runs do not symlink the
   raw user `~/.claude/settings.json` when plugin activation is in scope.
3. Codex native execution proceeds only if app-server provides a per-run allowlist,
   isolated config, plugin filter, or equivalent control point. If app-server only
   auto-loads the user's global Codex plugins, Codex native plugin execution is
   blocked for this change.
4. Runtime-native activation is gated by a reviewed activation identity: manifest
   and component declarations plus runtime-reported package identity/version/source
   pin/package hash when available. Missing stable identity is reported as
   identity-incomplete and either blocks native activation or requires an explicit
   high-risk acknowledgement; it is not presented as proof of safety.
5. Native-loaded plugin MCP servers still require MCP approval. If a runtime can
   only load a plugin as a whole package and cannot suppress unapproved MCP servers,
   then MCP-bearing plugins are blocked before approval or marked partial.
6. Marking a plugin activation identity reviewed does not directly mutate enablement
   or MCP approval, but effective activation status is recalculated from all gates
   and may move from blocked to eligible on the next managed run.
7. Plugin staging/load failures fail closed: the offending plugin/component is
   blocked and reported without taking down non-plugin runtime startup.
8. Settings > Plugins remains the Plugins management surface for now. This change
   fixes execution-truth UI issues inside the existing tab: MCP ownership/bridge,
   dead `setActiveTab` state, proportional confirmations, Codex unsupported-state
   honesty, and inventory version probing.

MCP-only behavior may remain labeled as partial behavior, but MCP-only is not an
acceptance path for full runtime-native plugin execution.

## Capabilities

### Modified Capabilities
- `runtime-plugins`: replace read-only/manifest-only runtime plugin assumptions
  with controlled runtime-native activation where proven. Existing review state,
  MCP approval, recovery/diagnostics, Codex read-only, Locus-owned execution path,
  runtime listing, action support, target mode, safe-mode, and developer-trust
  requirements are updated together so the archived spec remains internally
  consistent.

## Impact

- **Claude main process:** `src/main/lib/claude/agent-sdk-config-dir.ts` and related
  plugin/settings helpers must stage only approved plugin packages and write a
  filtered settings/activation manifest for Locus-managed runs.
- **Codex main process:** `src/main/lib/codex/*` must prove or add a per-run plugin
  control primitive before native plugin execution can be claimed.
- **Plugin policy owner:** add a shared policy owner under `src/main/lib/plugins/`
  for activation decisions, activation identity, blocked reasons, recovery posture, and
  capability-matrix inputs.
- **Renderer:** `agents-plugins-tab.tsx` renders proven activation state and in-tab
  trust fixes without moving Plugins out of Settings.
- **Docs:** `docs/ideas/settings-per-tab-audit.md` records that the execution-truth
  fixes are folded into this change, while the separate standalone extension surface
  decision remains deferred.
