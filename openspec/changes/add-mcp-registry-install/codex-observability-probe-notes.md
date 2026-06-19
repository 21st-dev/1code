# Codex MCP Registry Observability Probe Notes

Date: 2026-06-20

## Status

Task 1.2 is not complete yet. This pass records the current Locus-managed Codex
app-server observability surface and adds one narrow code change so tool-list
metadata returned by the app-server is not discarded.

Do not mark `Verified on Codex` design work complete from this note alone.

## Signals Already Available

### Pre-Run MCP Snapshot

Relevant file:

- `src/main/lib/runtime-mcp-config/codex.ts`

Before a Codex desktop run, Locus resolves Codex MCP config through
`resolveCodexMcpSnapshotForDesktopRun`. This materializes session MCP servers,
fetches settings-side tool metadata where possible, blocks `needs-auth` servers,
and computes an MCP config fingerprint.

This is config/readiness evidence, not app-server run evidence.

### App-Server MCP Status List

Relevant files:

- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/agent-runtime/stream-event-mapper.ts`
- `tests/codex-app-server-adapter.test.ts`
- `tests/runtime-stream-event-mapper.test.ts`

After thread startup and before turn start, the app-server adapter calls:

```text
mcpServerStatus/list
```

with:

```json
{ "detail": "toolsAndAuthOnly" }
```

The runtime-status summary now preserves:

- `serverCount`
- `readyServerCount`
- `serverNames`
- `authStatuses`
- `toolNamesByServer`

The summary is emitted to the renderer and also passes through the normalized
runtime event mapper, so it can become durable run evidence after redaction.

### MCP Elicitation

Relevant files:

- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/codex/app-server-user-interaction.ts`
- `tests/codex-app-server-user-interaction.test.ts`

The app-server adapter maps `mcpServer/elicitation/request` into the existing
AskUserQuestion flow. This is useful for setup/auth prompting, but it is not a
server connection, tool-list, or tool-call success signal.

## Signal Assessment

- Server connection/readiness: candidate signal exists from
  `mcpServerStatus/list`, summarized as ready counts and server names.
- Tool list: candidate signal exists from `mcpServerStatus/list` with
  `toolsAndAuthOnly`, now preserved as `toolNamesByServer`.
- Tool call success: not proven. Current app-server stream mapper does not expose
  an app-server notification that unambiguously maps an MCP tool call and its
  successful output to a server/config fingerprint.

## Missing Before Task 1.2 Can Be Checked

- A real Locus-managed Codex app-server run with a known harmless MCP server.
- Evidence that `mcpServerStatus/list` returns the expected server and tools in
  the real transport.
- Evidence that a user-initiated run can call a harmless MCP tool.
- A real app-server event or mapped chunk proving the MCP tool call succeeded.
- A mapping from observed server/tool names back to the registry entry
  fingerprint and config fingerprint.
- A durable verification record keyed by local machine, runtime, server name,
  entry fingerprint, and config fingerprint.

## Current Product Consequence

The current code is enough for `Ready to verify`/readiness diagnostics, but not
enough for automatic `Verified on Codex`. Codex registry verification must stay
deferred or narrowed until a real app-server run proves tool-call observability.
