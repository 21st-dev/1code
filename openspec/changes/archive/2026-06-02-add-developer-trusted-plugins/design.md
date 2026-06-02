## Context
The existing runtime plugin work deliberately avoids Codex++ style app patching and default local-code execution. Current Locus plugin capabilities are local governance surfaces:

- Runtime-aware plugin catalog and read-only source browsing.
- Plugin manifest fingerprints, review metadata, and source pins.
- Plugin safe mode and main-process safety gates.
- Doctor/Debug diagnostics.
- Controlled UI declarations rendered by Locus-owned components.

Phase 5 introduces a separate high-risk mode for local developer code. It is useful for advanced users who intentionally want local automation, but it cannot be presented as a safe marketplace plugin model.

## Goals
- Allow user-selected local developer plugin directories to be discovered by Locus.
- Require global Developer Plugin Mode and per-plugin trust acknowledgement before code loads.
- Treat developer plugins as equivalent to running local Node code.
- Keep plugin safe mode as an early load blocker and recovery path.
- Bind trust to the current reviewed plugin fingerprint so local edits force re-review.
- Show clear settings, Doctor, and Debug state for trusted-code plugins.
- Preserve the existing manifest-only and controlled UI boundaries.

## Non-Goals
- Do not build a Codex++ compatibility layer.
- Do not patch `app.asar`, re-sign apps, mutate Codex Desktop, or depend on Codex Desktop internals.
- Do not claim developer plugins are sandboxed, verified safe, or marketplace-approved.
- Do not allow remote marketplace packages to enter developer-trusted mode.
- Do not auto-activate plugin MCP servers, provider credentials, OAuth flows, terminal actions, or file writes through manifest declarations alone.
- Do not expose plaintext provider tokens, OAuth tokens, or MCP secret values to the renderer.

## Trust Model
Developer trusted plugins are intentionally full-trust local code:

```text
developer-trusted-code = user chose this local directory and accepts that it may run as local app code
```

This is not a security sandbox. Permission labels are review metadata and UI disclosure unless the capability is implemented through a Locus-owned API gate.

If Locus imports a developer plugin in the Electron main process, the plugin must be treated as same-process local code. A minimal API object is useful for product ergonomics, but it is not a confinement boundary because the plugin may still use Node APIs, app internals available to that process, filesystem APIs, child processes, and network calls.

The core controls are recovery and consent controls:

- Global Developer Plugin Mode must be enabled.
- The plugin directory must be user-selected or explicitly registered as a developer source.
- The current plugin fingerprint must be locally reviewed.
- The current plugin fingerprint must have a per-plugin trust acknowledgement.
- Plugin safe mode must be disabled.
- The loader must re-check these conditions immediately before importing any entrypoint.
- The current executable content fingerprint must match the trusted fingerprint.

## Developer Manifest
Developer plugins use a Locus-owned manifest under the plugin directory:

```text
.locus-plugin/developer.json
```

The manifest is declarative metadata plus an entrypoint reference:

```json
{
  "schemaVersion": 1,
  "id": "local.example.dev-plugin",
  "name": "Example Dev Plugin",
  "version": "0.1.0",
  "description": "Local developer automation.",
  "entry": "./dist/index.js",
  "minLocusVersion": "0.0.0",
  "permissions": ["local-code"],
  "capabilities": ["settings-panel"]
}
```

Rules:

- `entry` must resolve inside the plugin root after `realpath`.
- Remote URLs are rejected.
- Entry files are not imported until all developer trust gates pass.
- The manifest, canonical entry path, entry content hash, and bounded bundle metadata are included in review fingerprints.
- Manifest validation must not execute plugin code.

## Runtime Loading
The first implementation should keep the runtime surface intentionally small:

- Load only enabled, reviewed, trusted developer plugins from local developer sources.
- Import the declared entrypoint in the main process only after final gate recomputation.
- Provide a minimal Locus developer plugin API object rather than broad app internals.
- Record load status and errors for Doctor/Debug.
- Unload/disable behavior should prevent future invocations; app restart may be required because already imported same-process code cannot be guaranteed to unload cleanly.

If a future capability needs high-authority operations such as shell execution, file writes outside plugin data, MCP mutation, provider config changes, or native modules, it should use a separate explicit API proposal instead of relying on manifest permission labels.

## Storage
Developer plugin governance state should live with local plugin review state unless a larger persistence model is needed:

```text
plugin-review-state.json
developerPluginMode
developerTrustedPlugins[pluginReviewKey]
developerSources[]
```

Trust acknowledgements should include:

- plugin review key
- plugin fingerprint
- manifest ID
- canonical entry path
- entry content hash
- bounded bundle or lockfile hash metadata when available
- timestamp
- local source path

Do not store plugin code or raw secrets in this state file.

## UI
Settings > Plugins should show developer trusted plugins in the same plugin catalog with strong visual separation:

- Target mode: `Trusted local code`
- Execution: `May run local code`
- Trust state: `Not trusted`, `Trusted for current fingerprint`, `Changed since trusted`, `Blocked by safe mode`
- Warning copy: this is equivalent to running local code on this Mac.

Developer Plugin Mode should be a deliberate control near plugin safe mode. Normal manifest-only and controlled UI plugins must not display trust controls unless they are developer sources.

Avoid labels such as:

```text
safe
sandboxed
verified
Codex++ compatible
marketplace trusted
```

## Doctor / Debug
Doctor and per-plugin Debug should report:

- Developer Plugin Mode on/off.
- Whether safe mode blocked trusted-code loading.
- Whether each developer plugin has a valid manifest and contained entrypoint.
- Whether the current fingerprint is reviewed and trusted.
- Whether the plugin has been loaded this session.
- Load errors without dumping source code or secrets.

## Security Considerations
- Permission labels are disclosure metadata for same-process developer plugins. They must not be described as enforced confinement unless a separate out-of-process sandbox is implemented.
- Main process must never trust renderer-provided gate state or fingerprints.
- Loader code must perform final server-side discovery, manifest parse, fingerprint comparison, safe mode read, and trust acknowledgement comparison immediately before import.
- Symlink/path escape tests are required for manifest and entrypoint paths.
- Safe mode must block loading before import, not merely hide UI controls.
- Safe mode needs an out-of-band recovery path such as an environment or startup override so a broken developer plugin cannot permanently block the core UI.
- Developer trusted plugins must never be auto-installed or auto-enabled from remote store updates.
- A compromised local developer plugin can read local files or spawn processes if it imports Node APIs; UI copy and docs must say this plainly.
- A developer trusted plugin can make its own network calls and may bypass Locus local-only helper guards unless a future sandboxed execution model is introduced.

## Abuse Paths
- A malicious developer plugin exfiltrates local files, provider credentials, or runtime config over the network after same-process import.
- A developer plugin mutates `~/.claude`, `~/.codex`, MCP config, git state, or shell environment directly instead of using Locus APIs.
- The entry file changes after trust while manifest metadata stays the same.
- The renderer forges a fingerprint, gate state, path, or trust status.
- A plugin crash loop prevents Settings from loading unless safe mode is evaluated before import.
- A symlink or path swap changes the entrypoint between review and import.

## Rollout
1. Add OpenSpec and tests for the trust/gate model.
2. Add manifest parser and trust state helpers.
3. Add developer source discovery and review fingerprint integration.
4. Add settings UI and Doctor/Debug details.
5. Add minimal loader with fail-closed gates.
6. Run unit, type, OpenSpec, desktop smoke, screenshot, and recording verification.
