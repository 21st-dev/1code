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

## Current Matrix

| Runtime | Component | Current classification | Identity completeness | Blocked reason / evidence |
|---|---|---|---|---|
| Claude Code | commands | not-loadable | identity depends on manifest plus package source/version/pins/hash; local packages without stable hash remain identity-incomplete | Locus can stage reviewed plugin packages into an isolated config, but a managed SDK run has not yet proven native command activation. |
| Claude Code | skills | not-loadable | same as commands | Locus can stage reviewed plugin packages into an isolated config, but a managed SDK run has not yet proven native skill activation. |
| Claude Code | agents | not-loadable | same as commands | Locus can stage reviewed plugin packages into an isolated config, but a managed SDK run has not yet proven native sub-agent activation. |
| Claude Code | hooks | not-loadable | same as commands | Locus scans `hooks.json` / `hooks/` for review identity, but no managed SDK run has proven native plugin hook activation. |
| Claude Code | MCP servers | mcp-only | same as commands | Locus injects approved plugin MCP servers through its existing MCP config path. Native plugin-loaded MCP activation is not accepted without managed-run proof and current MCP approval. |
| Codex app-server | commands | not-loadable | Codex cache version/source pins can contribute identity, but no native activation is allowed while per-run control is missing | App-server receives fail-closed `plugins.<id>.enabled=false` config overrides, but no managed-run proof shows app-server honors installed/enabled plugins or per-run filtering. |
| Codex app-server | skills | not-loadable | same as commands | Same app-server proof gap. |
| Codex app-server | agents | not-loadable | same as commands | Same app-server proof gap. |
| Codex app-server | hooks | not-loadable | same as commands | Same app-server proof gap. |
| Codex app-server | MCP servers | not-loadable | same as commands | Codex plugin MCP declarations are metadata only in Locus until app-server native loading and MCP approval gating are proven. |

## Implementation Evidence

- Claude isolated config staging:
  `src/main/lib/claude/agent-sdk-config-dir.ts`
- Claude review/safe-mode/MCP gate owner:
  `src/main/lib/plugins/runtime-gates.ts`
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

Claude still needs a managed Agent SDK proof run with a test plugin that declares
commands, skills, agents, hooks, and MCP servers. The proof must show which
components are advertised or executable in the SDK stream, and must include
negative cases for unreviewed global plugins, safe mode, activation identity
drift, identity-incomplete packages, unapproved MCP servers, and staging failure.

Codex still needs a managed app-server proof run with isolated `CODEX_HOME` and
test plugins. The proof must show whether `thread/start` or `thread/resume`
honors installed/enabled plugin state and whether `plugins.<id>.enabled=false`
or another primitive can filter plugins per run. Until then Codex native plugin
execution remains blocked.
