## Context
Locus already treats current Claude and Codex plugin packages as manifest-only metadata. The update-review slice stores a deterministic manifest fingerprint and a local reviewed fingerprint. MCP approval identifiers are also bound to the current redacted MCP config fingerprint.

The missing behavior is enforcement: runtime paths still need a single fail-closed answer to "may this plugin capability participate in a Locus agent run?"

## Goals
- Block plugin-provided runtime capabilities when global plugin safe mode is enabled.
- Block plugin-provided runtime capabilities when the current plugin fingerprint is not locally reviewed.
- Keep review and safe-mode state local to Locus.
- Make blocked state visible in Settings > Plugins.
- Preserve read-only browsing of plugin metadata, sources, diagnostics, and review diffs.

## Non-Goals
- No plugin marketplace install/update flow.
- No Codex++ compatibility layer.
- No app patching, DOM patching, asar patching, re-signing, or watcher repair.
- No arbitrary local JS/TS tweak execution.
- No controlled UI plugin execution surface.
- No developer full-trust plugin mode.

## Decisions
- Store safe mode alongside local plugin review state because both are local governance metadata.
- Treat safe mode as a runtime gate, not a destructive disable action. It does not edit or delete plugin packages.
- Treat "reviewed" as a local acknowledgement of the current manifest fingerprint, not proof that the plugin is safe.
- Runtime MCP inclusion requires all of: plugin source enabled, safe mode disabled, current manifest fingerprint reviewed, current MCP config fingerprint approved, and no global/project server conflict.
- Claude plugin enablement mutation may disable any plugin, but enabling requires the current fingerprint to be reviewed and safe mode to be off.
- Locus-managed Claude runs skip the `~/.claude/plugins` symlink when plugin safe mode is enabled. This reduces accidental plugin exposure through the SDK config directory.

## Risk Controls
- Fail closed if review state is missing, malformed, or stale.
- Do not expose raw MCP secret values in review or approval metadata.
- Do not claim safe mode is a code sandbox.
- Do not claim reviewed plugins are trusted or verified.
