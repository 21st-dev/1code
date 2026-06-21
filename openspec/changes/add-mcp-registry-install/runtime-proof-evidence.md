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

Status: blocked

Required before checking tasks: 1.2

Evidence required:
- Isolated HOME / CODEX_HOME / app userData paths used for the run.
- MCP server name and registry entry/config fingerprints.
- App-server `mcpServerStatus/list` evidence showing the server and tool names.
- User-initiated prompt that caused the harmless MCP tool to run.
- A real app-server event or mapped chunk proving the MCP tool call succeeded.

Current status:
- Code-level pre-probe is recorded in `codex-observability-probe-notes.md`.
- Codex registry support is deferred until tool-call observability is proven.

## Scenario: verified-state-policy

Status: blocked

Required before checking tasks: 1.3

Evidence required:
- Decision from the Claude and Codex observability probes.
- Exact rule for whether passive run observation can upgrade registry servers to
  `Verified`, and for which runtime(s).
- Confirmation that runtimes without required signals remain disabled, narrowed,
  or deferred instead of producing fake verified state.

Current status:
- Claude real-runtime proof is now available for the calculator server, but
  Codex real-runtime proof remains deferred and no local `verified-local`
  upgrade has been observed. Keep this policy scenario blocked until the change
  either implements/proves the Claude verified upgrade or explicitly narrows
  `Verified` behavior to manual/check-only evidence.

## Scenario: claude-verified-upgrade

Status: blocked

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
  file was present after the run and no `verified-local` record was observed.
  This scenario remains blocked.

## Scenario: codex-verified-upgrade

Status: blocked

Required before checking tasks: 4.4

Evidence required:
- Full-field Codex registry materialization support.
- Real Codex app-server run evidence for server readiness, tool inventory, and
  successful harmless MCP tool call.
- Local verification record after the run showing `verified-local` for the same
  runtime, server name, entry fingerprint, and config fingerprint.

Current status:
- Codex registry install/check remains deferred for this change.

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
