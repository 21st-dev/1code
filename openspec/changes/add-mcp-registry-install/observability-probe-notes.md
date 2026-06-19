# MCP Registry Observability Probe Notes

Date: 2026-06-20

## Status

Task 1.1 is not complete yet. This pass is a code-level pre-probe that records
which Claude Agent SDK signals Locus already parses and what must still be proven
with a real registry-style MCP run.

Do not mark `Verified on Claude` design work complete from this note alone.

## Claude Signals Already Parsed

### SDK Init

Relevant files:

- `src/main/lib/claude/transform.ts`
- `src/main/lib/claude/types.ts`
- `src/main/lib/claude/agent-sdk-plugin-proof.ts`
- `src/main/lib/claude/agent-sdk-message-metadata.ts`

Claude SDK `system` messages with `subtype: "init"` are transformed into a
`session-init` chunk containing:

- `mcpServers`: server names and statuses from `msg.mcp_servers`
- `tools`: SDK-reported tool names from `msg.tools`
- `plugins`
- `skills`

The accepted MCP server statuses in renderer-facing chunks are:

- `connected`
- `failed`
- `pending`
- `needs-auth`

The existing plugin proof helper already summarizes `mcp_servers` and `tools`.
This is useful for registry verification, but it was built for plugin activation
proof and does not yet record registry entry/config fingerprints.

### MCP Tool Call Observation

Relevant files:

- `src/main/lib/claude/transform.ts`
- `src/main/lib/agent-guard/decision.ts`
- `src/renderer/features/agents/ui/agent-tool-registry.tsx`

Claude assistant messages and stream events already produce:

- `tool-input-available`
- `tool-output-available`
- `tool-output-error`

MCP tools can be identified by names matching the Claude convention:

- `mcp__<server>__<tool>`

This gives Locus a candidate signal for successful MCP tool calls after a real
agent run, assuming the matching `tool-output-available` belongs to an MCP tool
and no error chunk is emitted for that tool call.

## Signal Assessment

- Server connection: candidate signal exists from SDK init `mcp_servers[].status`.
- Tool list: candidate signal exists from SDK init `tools`, including names such as
  `mcp__server__tool`. This proves Claude exposed the tool inventory to the run,
  but it is not a separate low-level `tools/list` event.
- Tool call success: candidate signal exists from MCP-prefixed tool input plus
  successful output chunks.

## Missing Before Task 1.1 Can Be Checked

- A real Claude Agent SDK run with a known harmless MCP server.
- Evidence that SDK init includes the expected server status for that server.
- Evidence that SDK init includes at least one `mcp__<server>__<tool>` entry.
- Evidence that a user-initiated run can call a harmless tool and produce
  `tool-output-available`.
- A mapping from the observed server/tool names back to the registry entry
  fingerprint and config fingerprint.
- A durable verification record keyed by local machine, runtime, server name,
  entry fingerprint, and config fingerprint.

## Environment Constraint

This sandbox does not currently have an isolated Claude runtime login available
for a real Claude Agent SDK run. The prior desktop smoke also showed Electron can
abort in this sandbox, so the next proof should use an explicit isolated
`HOME`/runtime config and record raw SDK or app chunk evidence without exposing
tokens.

## Next Probe Shape

Use a harmless local stdio MCP server with one read-only probe tool. In an
isolated runtime environment:

1. Configure the server for Claude through the Runtime MCP Config service path.
2. Start a real Claude Agent SDK run.
3. Capture the `session-init` chunk and confirm the server status and
   `mcp__server__tool` inventory.
4. Ask Claude to call the harmless tool.
5. Capture the matching `tool-output-available`.
6. Record the exact evidence here without raw credentials.
