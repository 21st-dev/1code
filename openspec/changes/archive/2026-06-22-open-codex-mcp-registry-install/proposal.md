# Change: Open Codex MCP registry install with an honest connected state

## Why
`add-mcp-registry-install` shipped Claude-only registry install and kept Codex
fully fail-closed (`installability.ts` returns `codex-deferred`, `install.ts`
throws for Codex). `add-codex-app-server-mcp-tool-observability` then proved in
Phase 1 that Codex app-server exposes server readiness and tool inventory but no
post-execution MCP tool-result signal, so `Verified on Codex` must stay deferred.

The current result is a registry that only installs to Claude — even though the
isolated `CODEX_HOME` MCP materialization fix shows Codex app-server can load,
list, and call an MCP server (Phase 1 smoke: `readyServerCount:2`, tool listed,
tool actually called — using a local probe server, not yet a registry-installed
one). Codex MCP servers are plausibly installable and usable; only the automatic
verified badge is unavailable. Blocking all Codex install makes the store look
Claude-only and hides likely-working functionality.

## What Changes
- Allow Codex registry install only for targets whose config fields can be safely
  materialized by the Runtime MCP Config service (no unsupported fields, no
  unresolved Codex runtime auth/setup).
- Compute Codex runtime-auth state in the **main process** from real Codex
  integration/login state and feed it into installability/preview; do not trust a
  renderer-reported auth flag. Today the setup classifier marks every Codex target
  `runtime-auth:codex` missing, so without this nothing opens.
- Define where Codex registry identity (provider/entry/target id + entry and config
  fingerprints) is stored, since `addCodexMcpServer` cannot currently carry
  `_locusMcpRegistry` metadata the way Claude install does. Either extend the Codex
  config writer or keep a separate Locus-side local state keyed by fingerprint, so
  connected/check status binds to the registry entry rather than guessing by server
  name.
- Keep targets Codex cannot materialize blocked, with a concrete reason instead of
  a generic deferred label.
- After install, expose a connect/list Check that uses only the observable signals
  (server readiness, tool inventory) to mark a Codex server as connected with
  tools visible — a state between installed and verified. **v1 covers remote
  HTTP/SSE/streamable_http targets only**; stdio/package targets stay out of the
  connected check, because listing their tools launches the server process (Codex
  refresh already skips stdio probes for this reason).
- Cap Codex below `Verified on Codex`: connected/tools-listed is the ceiling until
  a post-execution tool-result signal exists (governed by
  `add-codex-app-server-mcp-tool-observability`).
- Differentiate UI status: Claude reaches `Verified` from tool-call success; Codex
  tops out at connected/unverified with an explicit "cannot auto-verify on Codex"
  reason.

## Out of Scope
- The post-execution MCP tool-result verification observer for Codex (blocked;
  remains in `add-codex-app-server-mcp-tool-observability`).
- Any change to Claude verification semantics or the verified-local tool-call rule.
- Opening install for targets requiring Codex runtime auth/fields that cannot be
  materialized.

## Impact
- Affected specs: `mcp-registry-install`
- Affected code: `src/main/lib/mcp-registry/installability.ts` (Codex
  materialization gate), `src/main/lib/mcp-registry/setup.ts` (runtime-auth
  resolution from real state), `src/main/lib/mcp-registry/service.ts` +
  `preview.ts` (inject Codex auth state instead of entry-only defaults),
  `src/main/lib/mcp-registry/install.ts` (allow materializable Codex install +
  registry identity), `src/main/lib/runtime-mcp-config/codex.ts`
  (`addCodexMcpServer` field coverage + identity storage), a Codex connect/list
  check (remote transports only), and Settings > MCP registry status UI/wording
- Dependency: builds on the Phase 1 finding in
  `add-codex-app-server-mcp-tool-observability`; does not require its blocked
  Phases 2–5
