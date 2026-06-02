## Context

Codex++ patches Codex Desktop `app.asar`, injects a loader, and runs tweak code from a user data directory. Its useful ideas are governance and recovery patterns, not its trust boundary. Locus owns its Electron app source, tRPC layer, SQLite data model, and renderer UI, so it should expose Locus-native plugin surfaces instead of patching or emulating Codex Desktop internals.

Current Locus state already supports:

- Runtime-scoped plugin discovery for Claude Code and Codex.
- Read-only Codex plugin cache browsing.
- Claude plugin enablement controls.
- Plugin MCP discovery and explicit approval for Claude plugin MCP servers.
- Source browsing for local/cache plugin roots.

## Goals / Non-Goals

Goals:

- Make plugin trust and execution posture explicit in backend metadata and Settings UI.
- Keep Codex plugins visible but read-only until Locus owns a safe Codex plugin execution path.
- Provide a clear update-review workflow for plugin, Codex++ reference, Codex Desktop, and Codex CLI changes.
- Preserve local-first boundaries: no renderer secrets, no silent external config writes, no uncontrolled app patching.
- Add focused tests and real UI verification.

Non-Goals:

- Do not execute arbitrary plugin JavaScript.
- Do not make Locus compatible with Codex++ tweaks.
- Do not patch Locus `app.asar` or Codex Desktop.
- Do not add native plugin loading.
- Do not add third-party marketplace installation or automatic plugin updates.
- Do not expose provider secrets, raw SQLite access, or shell execution to plugins.

## Decisions

- Decision: Introduce a target-mode field on plugin metadata.
  - Why: Users need a concrete label for whether a plugin is metadata-only, Locus-controlled, or fully trusted local code.
  - Initial implementation: existing discovered runtime packages are classified as `manifest-only` unless a future approved spec adds Locus-owned execution.

- Decision: Treat Codex++ as a reference source only.
  - Why: Codex++ permission declarations do not sandbox main-process `require()` or renderer `new Function()` execution.
  - Use: manifest fields, store commit pins, safe mode, doctor/debug, per-plugin data, update review.
  - Do not use: app patching, DOM patching, watcher repair, local-code-as-safe-plugin model.

- Decision: Keep update actions advisory in this change.
  - Why: Installing or replacing plugin code is an execution and supply-chain risk.
  - UI should show what changed and what must be reviewed; it should not auto-update packages.

- Decision: Use existing Settings > Plugins layout instead of adding a new screen.
  - Why: The current two-panel plugin browser already groups runtime packages and sources; target-mode and trust posture belong in that detail panel.

## Target Modes

`manifest-only`:

- Locus reads metadata, component lists, MCP declarations, source, hashes/review status where available.
- Locus does not execute plugin code.
- Locus may offer explicit MCP approval only through existing runtime configuration paths.

`controlled-ui`:

- Future Locus-owned extension points such as settings sections, workbench panels, and command buttons.
- Plugin capabilities go through Locus APIs and can be approved/revoked.
- No direct DOM patching, raw Node `fs`, raw shell, provider secret access, or SQLite access.

`developer-trusted-code`:

- Future opt-in local developer mode.
- UI must say it is equivalent to running local code on the machine.
- Not eligible for default marketplace install or normal third-party trust claims.

## Update Handling

Plugin update:

- Re-read manifest and component metadata.
- Flag permission, target-mode, scope, MCP, native, shell, filesystem, and network changes.
- Do not auto-enable new MCP servers or new execution surfaces.

Codex++ reference repo update:

- Re-run reference review against manifest, store pin, safe mode, doctor/debug, loader, tweak execution, permission enforcement, MCP sync, and native paths.
- Classify each upstream change as learn, backlog, or ignore.
- Keep direct patch/runtime code out of Locus.

Codex Desktop update:

- Should not affect Locus plugin behavior.
- Only relevant to Codex++ reference risk notes or if a user separately runs Codex++ inside Codex Desktop.

Codex CLI/runtime update:

- Re-check Locus runtime capability states and plugin discovery assumptions.
- Keep unsupported/degraded states honest until a safe primitive exists.

## Risks / Trade-Offs

- Risk: Users may think Codex and Claude plugins are interchangeable.
  - Mitigation: Keep runtime labels, target-mode labels, and read-only Codex hints visible.

- Risk: A future developer mode could be mistaken for a sandbox.
  - Mitigation: Use explicit `developer-trusted-code` language and require a separate spec before implementation.

- Risk: UI becomes too warning-heavy.
  - Mitigation: Use compact badges and a focused review panel instead of long explanatory text.

## Migration Plan

1. Add target-mode metadata to plugin discovery and tRPC output.
2. Add UI badges and detail rows for target mode, trust posture, execution status, and update-review hints.
3. Add tests for classification, copy, and read-only/non-executable behavior.
4. Add real Settings > Plugins smoke evidence.
5. Leave future execution modes disabled until separate specs are approved.

## Open Questions

- Should `controlled-ui` be represented now as a disabled future mode or only documented until the first execution surface exists?
- Should update-review metadata include content hashes in the first implementation, or should hashes wait for install/update flows?
- Should plugin safe mode be a global setting now, or only a planned requirement until execution exists?
