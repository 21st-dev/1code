# Codex MCP Registry Observability Probe Notes

Date: 2026-06-20

Updated: 2026-06-22

## Status

Task 1.2 is complete as a deferred Codex outcome. This pass records the current
Locus-managed Codex app-server observability surface and the 2026-06-22 real
smoke result after the isolated `CODEX_HOME` MCP materialization fix.

Do not mark `Verified on Codex` design work complete from this note alone.

2026-06-22 real smoke proves app-server MCP readiness/tool-list observability and
one `locus_edit.propose_file_edit` tool-call request from a Locus-managed Codex
run. It still does not expose a durable post-execution MCP tool output success
pair that can be tied to a registry config fingerprint.

## Real App-Server Smoke

Command class: Electron desktop smoke with isolated app user-data and inherited
Codex auth. No provider token or authorization header is recorded here.

Evidence path:

```text
.tmp-app-server-smoke/evidence/locus-codex-app-server-mcp-tool-proof/locus-edit-adoption.json
```

Result summary:

- Scenario: `locus-edit-adoption`
- Model: `gpt-5.5`
- `mcpServerStatus/list` returned `serverNames:["codex_apps","locus_edit"]`
  and `readyServerCount:2`.
- `toolNamesByServer.locus_edit` returned `["propose_file_edit"]`.
- The model issued one `locus_edit.propose_file_edit` request with operation
  `create`.
- Locus surfaced one approval prompt headed `locus_edit`.
- The canary file was not written because this smoke only proves approval-gated
  MCP tool-call request observability, not automatic execution.

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

### Dynamic Tool Calls Are Not MCP Success Evidence

Relevant files:

- `src/main/lib/codex/app-server-adapter.ts`
- `src/main/lib/codex/app-server-safety.ts`
- `tests/codex-app-server-adapter.test.ts`

The app-server adapter handles `item/tool/call` as a server request routed
through the approval bridge before side effects. The safety gate classifies it
as a pre-execution approval request. That request can prove Locus installed an
approval hook, but it is not a post-execution MCP tool output event and cannot
by itself prove a registry MCP tool succeeded.

The current app-server notification mapper handles text/reasoning/token usage,
diff/file-change, turn completion, and errors. It does not define a notification
shape equivalent to Claude's `tool-input-available` plus
`tool-output-available` pair for MCP tools.

## Signal Assessment

- Server connection/readiness: candidate signal exists from
  `mcpServerStatus/list`, summarized as ready counts and server names.
- Tool list: candidate signal exists from `mcpServerStatus/list` with
  `toolsAndAuthOnly`, now preserved as `toolNamesByServer`.
- Tool call request: proven for `locus_edit.propose_file_edit` in the real
  app-server smoke.
- Tool call success: not proven. Current app-server stream mapper does not expose
  an app-server notification that unambiguously maps an MCP tool call and its
  successful output to a server/config fingerprint.
- Dynamic tool approval: insufficient. `item/tool/call` is pre-execution
  approval/control evidence, not successful MCP tool output evidence.

## Missing Before Task 1.2 Can Be Checked

- A registry-backed real Locus-managed Codex app-server run with a known
  harmless MCP server.
- A real app-server event or mapped chunk proving the MCP tool call succeeded.
- A mapping from observed server/tool names back to the registry entry
  fingerprint and config fingerprint.
- A durable verification record keyed by local machine, runtime, server name,
  entry fingerprint, and config fingerprint.
- A confirmed protocol notification or response shape that represents MCP tool
  output success after execution, not a pre-execution approval request.

## Current Product Consequence

The current code is enough for `Ready to verify`/readiness diagnostics, but not
enough for automatic `Verified on Codex`. Codex registry verification must stay
deferred or narrowed until a real app-server run proves tool-call observability.
