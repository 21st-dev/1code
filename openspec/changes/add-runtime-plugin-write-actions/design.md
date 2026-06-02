## Context
The current marketplace center intentionally lists external runtime marketplaces as read-only inventory. This change opens a narrow write path, but only by invoking runtime-owned CLI commands from the Electron main process. Locus remains a coordinator and visibility layer, not a plugin runtime compatibility layer.

## Goals
- Expose the runtime-native plugin actions users expect in the Codex and Claude tabs.
- Keep each command scoped to the owning runtime and source of truth.
- Require a preview and explicit confirmation before every state-changing action.
- Keep command construction allowlisted, deterministic, redacted, and main-process owned.
- Preserve existing safe-mode and review language: provenance and pins are review inputs, not safety proof.

## Non-Goals
- Do not write arbitrary runtime config directly.
- Do not accept raw CLI args from renderer state.
- Do not execute plugins or plugin-provided MCP declarations while installing, listing, enabling, or disabling.
- Do not model Codex enable/disable as available until the Codex CLI exposes it.
- Do not run Claude chat slash commands; display `/reload-plugins` guidance only.

## Command Model
The main process owns an allowlist of action ids and maps each id to exact command argv:

### Codex
- `codex plugin marketplace add <source>`
- `codex plugin marketplace list`
- `codex plugin marketplace upgrade [marketplace]`
- `codex plugin marketplace remove <marketplace>`
- `codex plugin add <plugin[@marketplace]>`
- `codex plugin remove <plugin[@marketplace]>`

### Claude Code
- `claude plugin marketplace add <source> [--scope user|project|local]`
- `claude plugin marketplace list`
- `claude plugin marketplace update [marketplace]`
- `claude plugin marketplace remove <marketplace> [--scope user|project|local]`
- `claude plugin install <plugin[@marketplace]> [--scope user|project|local]`
- `claude plugin update <plugin[@marketplace]> [--scope user|project|local|managed]`
- `claude plugin enable <plugin[@marketplace]> [--scope user|project|local]`
- `claude plugin disable <plugin[@marketplace]> [--scope user|project|local]`
- `claude plugin uninstall <plugin[@marketplace]> [--scope user|project|local]`

The first implementation does not pass Codex `--config`, feature toggles, sparse checkout paths, Claude plugin userConfig values, Claude prune, or keep-data flags. Those options require separate UI and confirmation design.

## Confirmation And Safety
- The renderer requests a typed action id, target string, and optional scope.
- The main process validates runtime/action compatibility and rebuilds command argv.
- The preview returns runtime, action label, command, args, impact, destructive flag, target, and reload guidance.
- The execute mutation requires the preview confirmation token returned by the main process.
- Destructive actions require the target string to match the preview target.
- CLI stdout and stderr are redacted before returning to the renderer.
- The runtime command environment uses the same minimal non-secret allowlist used by marketplace reads.
- Successful writes refresh runtime marketplace inventory, local plugin metadata, and Doctor diagnostics.

## UI Model
- Settings > Plugins keeps the existing Locus Store separate from runtime marketplaces.
- Runtime marketplace detail shows an action rail for marketplace actions.
- Runtime plugin rows show only actions supported by that runtime and plugin status.
- Codex available plugins can be added and installed plugins can be removed; Codex enable/disable remains unavailable.
- Claude available plugins can be installed; installed plugins can be updated, enabled, disabled, or uninstalled.
- Claude mutation success shows a `/reload-plugins` hint because Claude Code may require a chat/plugin reload.

## Failure Handling
- Unsupported action: block before spawning a process and return a typed error.
- Missing or malformed target: block before spawning a process.
- CLI missing, timeout, or non-zero exit: return redacted diagnostics and keep previous inventory visible.
- Write succeeds but refresh fails: report the write result and show refresh diagnostics instead of hiding the write.

## Security Notes
- Runtime plugin marketplace sources can point at remote code. Confirmation copy must say the owning runtime will manage install/update state, and Locus is not verifying plugin code safety.
- Commit pins and package hashes from the Locus-native store do not authorize external runtime marketplace writes.
- Safe mode does not delete runtime plugin packages; it blocks plugin-provided runtime capability inclusion through existing gates.
