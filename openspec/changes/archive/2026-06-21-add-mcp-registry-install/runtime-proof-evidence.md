# MCP Registry Runtime Proof Evidence

Provider call authorization: required

This file tracks the real-runtime evidence that is still required before
`add-mcp-registry-install` can claim local `Verified` behavior. Do not paste raw
OAuth tokens, authorization headers, cookies, API keys, or unredacted config
files here.

## Scenario: claude-agent-sdk-mcp-observability

Status: passed

Required before checking tasks: 1.1

Evidence required:
- Isolated HOME / Claude config path used for the run.
- MCP server name and registry entry/config fingerprints.
- Claude `session-init` evidence showing the server status.
- Claude tool inventory evidence containing `mcp__<server>__<tool>`.
- User-initiated prompt that caused the harmless MCP tool to run.
- Matching `tool-output-available` evidence for that MCP tool.

Current status:
- Code-level pre-probe is recorded in `observability-probe-notes.md`.
- 2026-06-21 real Claude Agent SDK run evidence captured with isolated app
  state:
  - app userData: `/private/tmp/locus-mcp-registry-smoke`
  - Claude config home: `/private/tmp/locus-mcp-registry-home`
  - CODEX_HOME: `/private/tmp/locus-mcp-registry-home/.codex`
  - real macOS `HOME` retained for keychain-backed Claude login.
- Server: `calculator-mcp-server`; tool:
  `mcp__calculator-mcp-server__calculate`.
- Evidence path:
  `/private/tmp/locus-mcp-registry-smoke/claude-sessions/mqnq6k876a0v021o/projects/-Users-ethan-Code-GitHub-agent-code-for-me/807cfc13-eadd-451b-b011-fe3dbf6bce92.jsonl`.
- JSONL evidence:
  - line 3 records the user-initiated prompt requesting calculator `2 + 2`.
  - line 4 records `pendingMcpServers:["calculator-mcp-server"]`.
  - line 10 records ToolSearch returning
    `mcp__calculator-mcp-server__calculate`.
  - line 11 records assistant `tool_use` for
    `mcp__calculator-mcp-server__calculate` with input
    `{"expression":"2 + 2"}`.
  - line 12 records the matching tool result:
    `{"result":"4","resultType":"number","expression":"2 + 2","operation":"evaluate"}`.
  - line 13 records deferred tools updated with
    `mcp__calculator-mcp-server__calculate` and no remaining pending MCP
    servers.

## Scenario: codex-app-server-mcp-observability

Status: deferred

Required before checking tasks: 1.2

Evidence required:
- Isolated HOME / CODEX_HOME / app userData paths used for the run.
- MCP server name and registry entry/config fingerprints.
- App-server `mcpServerStatus/list` evidence showing the server and tool names.
- User-initiated prompt that caused the harmless MCP tool to run.
- A real app-server event or mapped chunk proving the MCP tool call succeeded.

Current status:
- Code-level pre-probe is recorded in `codex-observability-probe-notes.md`.
- 2026-06-22 real Locus-managed Codex app-server smoke recorded partial proof
  after the isolated `CODEX_HOME` MCP materialization fix:
  - evidence path:
    `.tmp-app-server-smoke/evidence/locus-codex-app-server-mcp-tool-proof/locus-edit-adoption.json`
  - isolated app userData:
    `/private/tmp/locus-codex-app-server-mcp-tool-userdata`
  - smoke scenario: `locus-edit-adoption`
  - model: `gpt-5.5`
  - app-server runtime status recorded `serverNames:["codex_apps","locus_edit"]`
    and `readyServerCount:2`.
  - `toolNamesByServer.locus_edit` contained `propose_file_edit`.
  - the run issued one `locus_edit.propose_file_edit` request with a create
    operation and surfaced a `locus_edit` approval prompt.
  - the canary file did not exist after the run because this signal is
    approval-request evidence, not automatic post-execution tool-output
    evidence.
- Codex registry support remains deferred until a post-execution successful MCP
  tool-output signal is available and can be tied to registry entry/config
  fingerprints.

## Scenario: verified-state-policy

Status: passed

Required before checking tasks: 1.3

Evidence required:
- Decision from the Claude and Codex observability probes.
- Exact rule for whether passive run observation can upgrade registry servers to
  `Verified`, and for which runtime(s).
- Confirmation that runtimes without required signals remain disabled, narrowed,
  or deferred instead of producing fake verified state.

Current status:
- 2026-06-22 policy implemented and narrowed:
  - Claude may upgrade a registry server to `verified-local` only when the
    Locus-managed Claude stream observes a matching
    `tool-input-available` for `mcp__<server>__<tool>` followed by
    `tool-output-available` for the same `toolCallId`.
  - The observed server must be present in the runtime-injected registry
    verification target map for the same runtime, server name, entry
    fingerprint, and config fingerprint.
  - `tool-output-error`, unmatched tools, non-registry tools, and Codex targets
    do not upgrade local verification state.
  - Codex `Verified` remains deferred until Codex app-server field
    materialization and tool-call observability proof pass.
- Code evidence:
  `src/main/lib/claude/agent-sdk-mcp-registry-verification.ts` and
  `tests/claude-agent-sdk-mcp-registry-verification.test.ts`.
- Verification run:
  `bun test tests/claude-agent-sdk-mcp-registry-verification.test.ts
  tests/claude-agent-sdk-stream-consumer.test.ts
  tests/runtime-mcp-config-service.test.ts
  tests/claude-agent-sdk-adapter-runner.test.ts
  tests/claude-agent-sdk-runtime-lifecycle.test.ts`.

## Scenario: claude-verified-upgrade

Status: passed

Required before checking tasks: 4.3

Evidence required:
- Local verification record before the run.
- Real Claude run evidence for server discovery, tool inventory, and successful
  harmless MCP tool call.
- Local verification record after the run showing `verified-local` for the same
  runtime, server name, entry fingerprint, and config fingerprint.

Current status:
- 2026-06-21 successful Claude MCP tool-call proof exists for
  `calculator-mcp-server`, but no
  `/private/tmp/locus-mcp-registry-smoke/mcp-registry-verification-state.json`
  file was present after that run and no `verified-local` record was observed.
- 2026-06-22 code support for this upgrade path landed, including the Claude
  stream observer and SDK HTTP/SSE materialization fix.
- 2026-06-22 real Claude GUI/runtime proof passed using the updated `main`
  branch:
  - app userData:
    `/private/tmp/locus-mcp-registry-smoke`
  - Claude config home:
    `/private/tmp/locus-mcp-registry-home`
  - CODEX_HOME:
    `/private/tmp/locus-mcp-registry-home/.codex`
  - registry config source:
    `/private/tmp/locus-mcp-registry-home/.claude.json`
  - server: `calculator-mcp-server`
  - entry fingerprint:
    `sha256:64c67a45623c1e4b350108027d5fdc1f3df16c93e6fa3b4d7d776dbf488fbcb3`
  - config fingerprint:
    `sha256:a40d89dd2fc59eb83e9a06713a003fd43319d823566aa4ae029758ee558f7f8f`
  - Claude JSONL evidence:
    `/private/tmp/locus-mcp-registry-smoke/claude-sessions/mqnrftnrw5lyimhn/projects/-Users-ethan-Code-GitHub-agent-code-for-me/08958b6e-681e-42df-a7db-ee1dc9cd261c.jsonl`
  - JSONL line 4 records `pendingMcpServers:["calculator-mcp-server"]`.
  - JSONL line 9 records ToolSearch surfacing
    `mcp__calculator-mcp-server__calculate`.
  - JSONL line 10 records the real `tool_use` call with input
    `{"expression":"2 + 2"}`.
  - JSONL line 11 records the matching tool result:
    `{"result":"4","resultType":"number","expression":"2 + 2","operation":"evaluate"}`.
  - JSONL line 12 records deferred tools updated with
    `mcp__calculator-mcp-server__calculate` and no remaining pending MCP
    servers.
  - JSONL line 14 records the final assistant response attributed to
    `calculator-mcp-server` / `calculate`.
  - Local verification record after the run:
    `/private/tmp/locus-mcp-registry-smoke/mcp-registry-verification-state.json`
    records `status:"verified-local"` and
    `reason:"claude-tool-call-success:calculate"` for the same runtime, server
    name, entry fingerprint, and config fingerprint.

## Scenario: codex-verified-upgrade

Status: deferred

Required before checking tasks: 4.4

Evidence required:
- Full-field Codex registry materialization support.
- Real Codex app-server run evidence for server readiness, tool inventory, and
  successful harmless MCP tool call.
- Local verification record after the run showing `verified-local` for the same
  runtime, server name, entry fingerprint, and config fingerprint.

Current status:
- 2026-06-22 Codex app-server materialization/readiness/tool-call-request proof
  exists for `locus_edit`, but no local `verified-local` record was written and
  no successful post-execution MCP tool output was observed.
- Codex registry install/check and `Verified on Codex` remain deferred for this
  change.

## Scenario: claude-registry-real-run

Status: passed

Required before checking tasks: 5.6

Evidence required:
- Official-registry MCP server selected and installed to Claude through the MCP
  registry UI/service path.
- Redacted install preview captured before confirmation.
- Real Claude run discovers the installed server, lists at least one tool, and
  calls a harmless tool.
- Logs/renderer state show no plaintext token, authorization header, or secret.

Current status:
- 2026-06-21 passed for Claude-only proof using official-registry
  `io.github.cyanheads/calculator-mcp-server` with target
  `remote:streamable_http:0`.
- Install/check path was exercised through Settings > MCP before the run;
  Settings showed `calculator-mcp-server` connected with one tool.
- Real Claude run evidence:
  - screenshot:
    `/var/folders/_g/cmqkvs694c7g4rmksh2jd5hr0000gn/T/codex-clipboard-0043f57b-2fd7-46ad-92ca-cd260d082a85.png`
    shows the final response: calculator MCP server `calculate` evaluated
    `2 + 2 = 4`.
  - JSONL path:
    `/private/tmp/locus-mcp-registry-smoke/claude-sessions/mqnq6k876a0v021o/projects/-Users-ethan-Code-GitHub-agent-code-for-me/807cfc13-eadd-451b-b011-fe3dbf6bce92.jsonl`.
  - line 10: tool inventory/deferred lookup surfaced
    `mcp__calculator-mcp-server__calculate`.
  - line 11: real MCP tool call executed.
  - line 12: matching MCP tool result returned `4`.
- No OAuth token, authorization header, cookie, API key, or plaintext secret is
  recorded in this evidence.
