# Runtime-Native Plugin Proof Matrix

Last updated: 2026-06-19

This file records the current proof state for runtime-native plugin execution.
It is intentionally conservative: a component is `runtime-native-loadable` only
when the owning runtime loader and the Locus per-run control path have both been
proven. A staged package or parsed manifest alone is not native execution proof.

## Local Probe Evidence

- Bundled Codex CLI: `resources/bin/darwin-arm64/codex --version` returned
  `codex-cli 0.139.0`.
- With an isolated temporary `CODEX_HOME`, `codex plugin list --json` returned
  JSON with `installed` and `available` arrays.
- With an isolated temporary `CODEX_HOME`,
  `codex plugin marketplace list --json` returned JSON with a `marketplaces`
  array.
- `src/main/lib/plugins/runtime-marketplace.ts` now probes Codex JSON inventory
  commands first and falls back to text output when `--json` is not supported.
- `tests/runtime-plugin-marketplace.test.ts` covers Codex JSON parsing and text
  fallback.
- `bun scripts/probe-codex-app-server-plugin-protocol.ts --timeout-ms=8000`
  against the bundled `resources/bin/darwin-arm64/codex app-server --listen
  stdio://` and the user's default `CODEX_HOME` produced bounded protocol
  evidence:
  - `initialize` returned `userAgent`, `codexHome`, `platformFamily`, and
    `platformOs`.
  - `plugin/installed` returned 3 marketplaces and 16 installed/enabled plugins.
  - `plugin/list` returned 3 marketplaces, 186 marketplace plugins, 16 installed
    plugins, and 45 featured plugin IDs.
  - `skills/list` returned one current-workspace skill root with 168 skills;
    `hooks/list` returned one current-workspace hook root with zero hooks.
  - An unknown-method probe exposed accepted client methods including global
    plugin management/read methods (`plugin/list`, `plugin/installed`,
    `plugin/read`, `plugin/skill/read`, `plugin/install`, `plugin/uninstall`,
    and plugin sharing methods) and the generic `thread/settings/update` method.
  - No typed per-run plugin allowlist/filter method was observed in the app-server
    accepted-method list. `thread/settings/update` is treated as insufficient
    proof until a managed `thread/start`/`thread/resume` run shows plugin
    allowlist enforcement.
- `bun scripts/probe-codex-app-server-plugin-protocol.ts --timeout-ms=8000
  --include-thread-start=1 --thread-start-disabled-plugin-id=figma@openai-curated`
  starts an ephemeral `thread/start` and intentionally does not send
  `turn/start`, so it does not call a model. The bundled app-server accepted the
  managed thread start and returned a thread/session id, zero turns, and the
  passed config key `plugins.figma@openai-curated.enabled`. The response
  `instructionSources` contained only the project `AGENTS.md` and zero
  plugin-like instruction sources. This proves the low-risk thread-start probe
  path works, but it does not prove plugin component execution or per-run plugin
  allowlist enforcement.
- `bun scripts/probe-codex-app-server-plugin-protocol.ts --timeout-ms=8000
  --seed-local-test-plugin=1 --include-thread-start=1
  --thread-start-disabled-plugin-id=proof-plugin@locus-proof` builds a temporary
  local marketplace with `.agents/plugins/marketplace.json`, installs
  `proof-plugin@locus-proof` through the bundled Codex CLI, and starts app-server
  with an isolated temporary `CODEX_HOME`. The seeded plugin appears in
  `plugin/installed` and `plugin/list` as installed+enabled, and
  `skills/list` reports `targetSkillPresent: true` for
  `proof-plugin:proof-skill`. This proves app-server honors globally
  installed/enabled Codex plugin state on the process-level plugin/skill surface.
- The same seeded probe passes `plugins.proof-plugin@locus-proof.enabled=false`
  into `thread/start`. App-server accepts the key, but no typed per-run plugin
  allowlist/filter method is exposed, `plugin/installed` and `plugin/list` still
  report the seeded plugin enabled, `skills/list` still reports the seeded plugin
  skill present, and no-turn `thread/start` shows only project instructions with
  zero plugin-like instruction sources. This is not sufficient per-run control for
  Locus-managed native Codex plugin activation.
- Claude Agent SDK type declarations expose per-session
  `options.plugins: [{ type: "local", path, skipMcpDiscovery }]`, which the SDK
  implementation maps to `--plugin-dir` or `--plugin-dir-no-mcp`. The bundled
  Claude binary help also documents `--plugin-dir-no-mcp` as loading the plugin
  while leaving `.mcp.json` unread so the caller owns MCP connections.
- `bun scripts/probe-claude-agent-sdk-plugin-loading.ts --timeout-ms=8000`
  creates an isolated temporary `CLAUDE_CONFIG_DIR`, a temporary project, and a
  Claude plugin with `.claude-plugin/plugin.json`, command, skill, agent,
  `hooks.json`, and `.mcp.json`. The bundled Claude `plugin validate` accepted
  the generated plugin manifest.
- `bun scripts/probe-claude-agent-sdk-plugin-loading.ts --timeout-ms=15000
  --run-sdk=1 --send-probe-prompt=1` started the Agent SDK with
  `skipMcpDiscovery=true`, received `system:hook_started`,
  `system:hook_response`, and `system:init`, then closed before any
  `assistant` or `result` message. The `system:init` listed
  `locus-native-proof` in `plugins`, `locus-native-proof:locus-proof-skill` in
  `skills`, `locus-native-proof:locus-proof-agent` in `agents`, and
  `locus-native-proof:locus-proof-command` in `slashCommands`. The hook emitted
  `LOCUS_CLAUDE_PLUGIN_HOOK_PROOF`. `mcpServerNames` was empty, proving the
  plugin's `.mcp.json` was not activated through the native loader when
  `skipMcpDiscovery=true`.
- `bun scripts/probe-claude-agent-sdk-plugin-loading.ts --timeout-ms=15000
  --run-sdk=1 --send-probe-prompt=1 --skip-mcp-discovery=0` ran the same plugin
  with native MCP discovery enabled. The SDK init listed
  `plugin:locus-native-proof:locus-proof-mcp` in `mcpServerNames`, while still
  closing before any `assistant` or `result` message. This proves native plugin
  MCP discovery exists and must remain disabled in Locus-managed native plugin
  loading unless the current MCP approval gate explicitly allows it.
- Claude runtime-native activation identity is derived from the bounded manifest
  review fingerprint plus package identity/source, package version, source pins,
  and package hash when available. `tests/runtime-native-activation.test.ts`
  proves deterministic identity hashing, identity-incomplete blocking, and
  drifted identity blocking before activation. `tests/plugin-update-review.test.ts`
  proves reviewed activation identity state is stored separately from manifest
  review and that a later package hash drift reports `identity-drifted`.
- A temporary SDK probe showed Claude auto-loads plugins from
  `CLAUDE_CONFIG_DIR/skills/<name>/.claude-plugin/plugin.json` even when the host
  does not pass that plugin through `options.plugins`: the unreviewed test plugin
  appeared in `system:init.plugins`, `skills`, and `slashCommands`. Locus now
  stages `skills`, `commands`, and `agents` entry-by-entry instead of symlinking
  the raw directories, excluding any entry with a `.claude-plugin/plugin.json` or
  `.claude-plugin/marketplace.json`.
- A follow-up SDK probe that first ran
  `ensureClaudeAgentSdkIsolatedConfigDir` proved the filtered controlled path:
  the unreviewed skills-dir plugin no longer appeared in `system:init.plugins`,
  plugin skills, or slash commands, while a normal non-plugin `regular-skill`
  still appeared.
- A safe-mode SDK probe with a globally enabled skills-dir plugin and a reviewed
  staging candidate proved `nativePluginConfigs: []`, zero plugin entries in
  `system:init.plugins`, zero plugin skills/slash commands, and preserved
  non-plugin `regular-skill`.
- `bun scripts/probe-runtime-native-managed-run.ts --timeout-ms=15000` provides
  the managed-run proof path: it first calls
  `ensureClaudeAgentSdkIsolatedConfigDir`, then passes the returned
  `nativePluginConfigs` into the Claude Agent SDK and closes after `system:init`
  before any model turn. The run returned `pass: true` with these facts:
  - controlled mode produced one staged native plugin config and SDK init listed
    `locus-managed-reviewed` plus its command, skill, agent, and hook marker;
  - a globally enabled plugin hidden under the raw `skills/` directory did not
    appear in `plugins`, `skills`, `agents`, or `slashCommands`;
  - `regular-skill` remained visible in controlled, safe-mode, and staging-failure
    runs;
  - plugin MCP discovery remained skipped (`mcpServerNames: []`) while the plugin
    `.mcp.json` existed;
  - safe mode produced `nativePluginConfigs: []`, no plugin hook output, and no
    reviewed plugin in SDK init;
  - a missing plugin source produced a `source-missing` staging failure and no
    native plugin config;
  - runtime-native policy checks blocked drifted activation identity,
    identity-incomplete packages, and Codex native activation with
    `runtime-native-unsupported` plus `per-run-plugin-control-missing`.

## Current Matrix

| Runtime | Component | Current classification | Identity completeness | Blocked reason / evidence |
|---|---|---|---|---|
| Claude Code | commands | runtime-native-loadable | identity depends on manifest plus package source/version/pins/hash; local packages without stable hash remain identity-incomplete | Agent SDK `options.plugins` with an isolated config lists plugin commands in `system:init`; Locus passes only activation-policy-allowed staged plugin dirs. |
| Claude Code | skills | runtime-native-loadable | same as commands | Agent SDK `options.plugins` with an isolated config lists plugin skills in `system:init`; Locus passes only activation-policy-allowed staged plugin dirs. |
| Claude Code | agents | runtime-native-loadable | same as commands | Agent SDK `options.plugins` with an isolated config lists plugin agents in `system:init`; Locus passes only activation-policy-allowed staged plugin dirs. |
| Claude Code | hooks | runtime-native-loadable | same as commands | Agent SDK `options.plugins` executes the test plugin `SessionStart` hook and emits hook events before the first model turn; Locus passes only activation-policy-allowed staged plugin dirs. |
| Claude Code | MCP servers | mcp-only | same as commands | Agent SDK native plugin MCP discovery is proven: with `skipMcpDiscovery=false`, the plugin MCP server appears in `system:init`; with `skipMcpDiscovery=true`, it does not. Locus-managed native plugin loading must use `skipMcpDiscovery=true` and keep approved plugin MCP servers on the existing Locus MCP config path. |
| Codex app-server | commands | not-loadable | Codex cache version/source pins can contribute identity, but no native activation is allowed while per-run control is missing | App-server exposes global installed/enabled plugin inventory, but no managed-run proof shows commands are per-run filterable. |
| Codex app-server | skills | not-loadable | same as commands | A seeded installed+enabled test plugin appears in app-server `skills/list`, but `plugins.<id>.enabled=false` at `thread/start` is not proven to filter that global skill surface and no typed per-run allowlist exists. |
| Codex app-server | agents | not-loadable | same as commands | App-server exposes global plugin inventory, but no managed-run proof shows agents are per-run filterable. |
| Codex app-server | hooks | not-loadable | same as commands | App-server exposes global hook inventory, but no managed-run proof shows hooks are per-run filterable. |
| Codex app-server | MCP servers | not-loadable | same as commands | Codex plugin MCP declarations are metadata only in Locus until app-server native loading and MCP approval gating are proven. |

## Implementation Evidence

- Claude isolated config staging:
  `src/main/lib/claude/agent-sdk-config-dir.ts`
- Claude staged native plugin handoff:
  `src/main/lib/claude/agent-sdk-runtime-startup.ts`,
  `src/main/lib/claude/agent-sdk-runtime-lifecycle.ts`, and
  `src/main/lib/claude/agent-sdk-query-options.ts`
- Claude review/safe-mode/MCP gate owner:
  `src/main/lib/plugins/runtime-gates.ts`
- Runtime-native activation identity and drift gate:
  `src/main/lib/plugins/runtime-native-activation.ts` and
  `src/main/lib/plugins/update-review-state.ts`
- Codex app-server config handoff:
  `src/main/lib/codex/app-server-adapter.ts`
- Codex fail-closed plugin override owner:
  `src/main/lib/codex/app-server-plugin-config.ts`
- Codex app-server plugin protocol proof helper:
  `src/main/lib/codex/app-server-plugin-proof.ts`
- Codex app-server plugin protocol proof script:
  `scripts/probe-codex-app-server-plugin-protocol.ts`
- Runtime-native activation policy owner:
  `src/main/lib/plugins/runtime-native-activation.ts`
- Runtime capability truth:
  `src/shared/agent-runtime-capabilities.ts` and
  `src/shared/codex-runtime-capabilities.ts`

## Remaining Proof Needed

Claude now has managed Agent SDK proof that the Locus isolated-config staging
path can load reviewed plugin commands, skills, agents, hooks, and MCP metadata
from a controlled run. Claude also has SDK-backed negative proof that raw
skills-dir plugins are filtered out of controlled isolated runs, safe mode
exposes zero plugin components while preserving non-plugin skills, and staging
failure fails closed. Runtime-native policy checks cover reviewed activation
identity drift, identity-incomplete packages, and Codex blocked state.

Codex app-server now has an isolated `CODEX_HOME` seeded-plugin proof: global
installed/enabled plugin state reaches app-server inventory and the global skill
surface. The proof does not expose a Locus-controllable per-run plugin filter:
`thread/start` accepts `plugins.<id>.enabled=false`, but no typed allowlist method
exists and the seeded plugin remains visible in global plugin/skill inventory. Per
this change's design gate, Codex native plugin execution remains blocked for this
change and should move only through a follow-up that adds or proves a real per-run
control primitive. Follow-up proposal:
`openspec/changes/add-codex-app-server-plugin-run-control`.
