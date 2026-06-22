# Change: Add Codex app-server MCP tool observability

## Status

**Deferred — Phase 1 complete, Phases 2–5 blocked. (As of 2026-06-22.)**

Phase 1 ran a real Codex app-server probe and found server readiness and tool
inventory are observable, but no post-execution MCP tool-result signal exists in
bundled Codex `0.139.0` (see `phase1-probe-evidence.md`). Without that signal,
`Verified on Codex` would overstate runtime usability, so the verification
observer (Phases 2–5) is not implemented.

Re-open only when Codex app-server exposes a stable post-execution MCP tool-result
notification/response tied to a stable call id and full server/tool name.

Archived with `--skip-specs`: the proof-gate / verification spec deltas describe
unbuilt behavior and are intentionally NOT applied to the canonical spec. The
landed `mcp-registry-install` spec already records Codex registry support as
deferred. Codex registry install UX (without verification) is handled separately by
`open-codex-mcp-registry-install`.

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
