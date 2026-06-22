# Change: Add Codex app-server MCP tool observability

## Why
`add-mcp-registry-install` intentionally left Codex registry verification
deferred because Locus can currently observe Codex app-server MCP readiness,
tool names, and `item/tool/call` requests, but not a post-execution successful
MCP tool result tied to a registry entry/config fingerprint.

Without that signal, `Verified on Codex` would overstate runtime usability.

## What Changes
- Probe Codex app-server protocol/runtime behavior with a harmless MCP server and
  record whether a real post-execution MCP tool result is observable.
- If the signal exists, normalize Codex app-server MCP tool input/output/error
  events into Locus runtime events without treating approval requests as success.
- Add Codex registry verification that upgrades to `verified-local` only from a
  matched server/tool/fingerprint plus successful non-error tool output.
- Keep Codex registry install/check/Verified unavailable or deferred when the
  required post-execution output signal cannot be proven.

## Impact
- Affected specs: mcp-registry-install
- Affected code: `src/main/lib/codex/app-server-*`,
  `src/main/lib/mcp-registry/*`, Settings > MCP registry status, proof scripts
  and tests
