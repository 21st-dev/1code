## 1. Protocol Proof

Phase 1 is a stop-gated spike. Complete only tasks 1.1-1.3 first, using the
existing probe notes as the starting point. Do not start runtime mapping,
verification observers, install expansion, or proof gates unless task 1.3
records a stable post-execution MCP tool result signal.

- [x] 1.1 Add or update a Codex app-server MCP observability probe that runs with
  isolated `HOME`, `CODEX_HOME`, and app user-data against a harmless MCP server.
- [x] 1.2 Record redacted evidence for `mcpServerStatus/list`, tool inventory,
  tool-call request, and any post-execution tool result or error payloads.
- [x] 1.3 If no post-execution result signal exists, document the missing signal,
  keep Codex registry Verified deferred, and stop before phases 2-5.

Phase 1 evidence: `phase1-probe-evidence.md`. The probe reached Codex
app-server MCP readiness and a harmless `tools/call` request, but no stable
post-execution tool output/result signal was observable, so phases 2-5 remain
blocked/deferred.

## 2. Runtime Event Mapping

- [ ] 2.1 Add app-server event/request parsing for proven post-execution MCP tool
  results, preserving stable `toolCallId`, server name, tool name, and output.
- [ ] 2.2 Emit normalized `tool-input-available`, `tool-output-available`, and
  `tool-output-error` equivalents for Codex app-server MCP calls only when the
  protocol evidence supports them.
- [ ] 2.3 Add fail-closed tests proving `item/tool/call`, approval prompts,
  readiness, and model text alone do not emit successful tool-output proof.
- [ ] 2.4 Ensure emitted output and persisted diagnostics are redacted before they
  reach renderer state or job/event storage.

## 3. Registry Verification

- [ ] 3.1 Add a Codex MCP registry verification observer keyed by runtime, server
  name, entry fingerprint, and config fingerprint.
- [ ] 3.2 Require matched input/output call ids, a registry-managed target, and
  non-error output before writing `verified-local`.
- [ ] 3.3 Reject runtime/domain-level error payloads such as non-empty `error`,
  `isError`, `ok:false`, `success:false`, or failed/error statuses.
- [ ] 3.4 Keep Codex registry status deferred/unavailable when field
  materialization or observability proof is incomplete.

## 4. Codex Registry Install/Check UX

Codex registry install is an installability decision, not verification proof.
It may be opened for safe setup-free targets even if Codex automatic
verification remains deferred, but only with explicit UX that the server will
remain `Installed / Unverified` until a real app-server run can emit successful
post-execution tool output. If that UX cannot be shipped in the same slice, do
not expose Codex install.

- [ ] 4.1 Only expose Codex registry install for setup-free targets whose config
  fields can be safely materialized by the Runtime MCP Config service, and only
  when the UI names the current Codex auto-verification limitation.
- [ ] 4.2 Keep Codex install success as `Installed / Unverified` until a real
  app-server run writes `verified-local`.
- [ ] 4.3 Keep explicit Check connect/list-only by default; it must not call
  arbitrary MCP tools.
- [ ] 4.4 Show Codex deferred/unavailable reasons when any required proof gate is
  missing.

## 5. Real Runtime Proof

- [ ] 5.1 Run a real Codex app-server session against a harmless registry MCP
  server and record redacted evidence for discovery, tool list, successful
  tool call, and local verification state.
- [ ] 5.2 Prove no plaintext token, authorization header, cookie, API key, or raw
  secret is committed in evidence, logs, renderer state, or persisted events.
- [ ] 5.3 Update the MCP registry proof evidence gate so Codex checked tasks require
  passed proof rather than deferred status.

## 6. Validation

- [ ] 6.1 Targeted Codex app-server event/verification tests.
- [ ] 6.2 MCP registry installability/service/router tests for Codex deferred and
  verified paths.
- [ ] 6.3 `bun run ts:check`.
- [ ] 6.4 `bun run lint:changed`.
- [ ] 6.5 Architecture guard.
- [ ] 6.6 `openspec validate add-codex-app-server-mcp-tool-observability --strict --no-interactive`.
