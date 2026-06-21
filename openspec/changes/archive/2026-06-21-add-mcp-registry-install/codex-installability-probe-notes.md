# Codex app-server MCP registry installability probe

Date: 2026-06-20

## Scope

This note covers task 1.4 for `add-mcp-registry-install`: whether the current
Codex app-server path can represent registry-relevant MCP fields for install,
runtime inclusion, and capability reporting.

## Result

Codex app-server is not ready for full registry install write support.

The shared Runtime MCP Config service can read and materialize a useful subset of
existing Codex MCP config into app-server runs:

- stdio `env` values.
- stdio `env_vars` references resolved from `process.env`.
- stdio `cwd`, including relative path-like command resolution.
- HTTP `http_headers`.
- HTTP `env_http_headers` references resolved from `process.env`.
- HTTP `bearer_token_env_var` as an `Authorization: Bearer ...` header when the
  environment variable is present.
- `streamable_http`, `http`, and `sse` transports, all materialized as app-server
  HTTP MCP servers.
- `enabled: false` entries are excluded from the app-server session.
- project-scoped lookup through the Codex CLI `cwd` for desktop runs.

2026-06-22 real Locus-managed Codex app-server smoke added runtime evidence for
the materialization path. The isolated app-server `CODEX_HOME/config.toml`
received the materialized `locus_edit` stdio server, `mcpServerStatus/list`
returned `locus_edit`, and `toolNamesByServer.locus_edit` contained
`propose_file_edit`.

The current write path is narrower. `addCodexMcpServer` calls
`codex mcp add` and supports only global basic stdio `command`/`args` or HTTP
`url`. It does not write or stage registry-required fields such as env var
references, HTTP headers, env-header references, bearer-token env refs, `cwd`,
disabled/inactive setup state, or project scope.

## Decision

Codex registry install and `Verified on Codex` remain deferred for this change
until both of these are true:

- Codex app-server configuration writes can safely stage or write the full
  registry field set, including inactive setup when required.
- Codex app-server runtime proof shows connection, tool-list, and successful
  tool-call signals for a Locus-managed run.

Claude remains the first shippable registry install target.

2026-06-22 update: connection and tool-list signals now have real app-server
evidence, and one approval-gated MCP tool-call request was observed. The
successful post-execution tool-output signal is still missing, so the decision
does not change.

## Evidence

- `src/main/lib/runtime-mcp-config/codex.ts`
  - `resolveCodexStdioEnv`
  - `resolveCodexHttpHeaders`
  - `resolveCodexStdioCwd`
  - `resolveCodexStdioCommand`
  - `resolveCodexMcpSnapshot`
  - `addCodexMcpServer`
- `src/shared/codex-runtime-capabilities.ts`
  - Codex app-server `mcpConfiguration` remains `degraded`.
- `tests/runtime-mcp-config-service.test.ts`
  - Covers materialization of registry-relevant read/runtime fields and current
    basic global-only write shape.
- `tests/codex-runtime-capabilities.test.ts`
  - Guards the app-server `mcpConfiguration` degraded status and Codex registry
    install wording.
