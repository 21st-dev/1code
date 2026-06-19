# Codex App-Server Plugin Run Control Smoke Evidence

Date: 2026-06-19

## Bundled App-Server Probe

Command:

```bash
bun scripts/probe-codex-app-server-plugin-protocol.ts --seed-local-test-plugin=1 --include-thread-start=1 --thread-start-disabled-plugin-id=proof-plugin@locus-proof --timeout-ms=15000 --out=/private/tmp/locus-codex-plugin-proof.json
```

Result: passed.

Observed facts:

- Bundled Codex binary: `resources/bin/darwin-arm64/codex`.
- Probe used a temporary `CODEX_HOME`.
- Seeded plugin `proof-plugin@locus-proof` was visible through `plugin/installed` and `plugin/list`.
- Seeded skill `proof-plugin:proof-skill` was visible through `skills/list`.
- The probe sampled global `~/.codex/plugins` entries including `figma`, `github`, `gmail`, `google-drive`, `notion`, `openai-developers`, `render`, and others.
- `leakedGlobalPluginNames` was empty.
- Assessment reported `supportsIsolatedCodexHomeControl: true`.
- Assessment reported `hasTypedPerRunPluginAllowlist: false`; the proven Codex control primitive remains isolated `CODEX_HOME`, not a typed app-server per-run allowlist API.

## Disabled Next-Run Probe

Command: a temporary Bun probe called `prepareCodexAppServerIsolatedPluginHome`
with `disabled-proof@locus-proof` marked disabled, then started bundled
`codex app-server` against the generated isolated `CODEX_HOME`.

Result: passed.

Observed facts:

- `stagedEntries` was empty.
- `blockedEntries` contained `disabled-proof@locus-proof` with reason `disabled`.
- `pluginConfigOverrides` contained `plugins.disabled-proof@locus-proof.enabled: false`.
- `plugin/installed` returned no plugin ids.
- `plugin/list` returned no plugin ids.
- `skills/list` did not contain `disabled-proof:disabled-skill`.

This proves a disabled plugin is not staged and is not visible to the next
isolated app-server run.

## Scoped Activation UI Check

Code path inspected:

- `src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx`

Observed facts:

- `PluginScopedActivationPanel` renders the run-scope selector.
- Scope options include global, project, chat, and sub-chat when those IDs are available.
- Non-global scopes expose inherit/custom mode.
- Custom mode exposes a per-plugin "visible in this scope" switch.
- The switch persists through `trpc.plugins.setRuntimeNativeScopedSelection`.
- The detail panel passes the selected scope, scope record, and update handlers into the plugin detail surface.

## Focused Tests

Command:

```bash
bun test tests/codex-app-server-plugin-home.test.ts tests/codex-app-server-plugin-proof.test.ts tests/plugin-update-review.test.ts tests/codex-app-server-plugin-allowlist.test.ts tests/plugin-safe-mode-runtime.test.ts
```

Result: 39 pass, 0 fail.
