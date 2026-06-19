# MCP Registry Runtime Proof Evidence

Provider call authorization: required

This file tracks the real-runtime evidence that is still required before
`add-mcp-registry-install` can claim local `Verified` behavior. Do not paste raw
OAuth tokens, authorization headers, cookies, API keys, or unredacted config
files here.

## Scenario: claude-agent-sdk-mcp-observability

Status: blocked

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
- Real Claude Agent SDK run evidence is still missing in this sandbox.

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
- Claude and Codex real-runtime proof is incomplete, so this policy remains
  intentionally unresolved.

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
- No real Claude `verified-local` upgrade has been proven.

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

Status: blocked

Required before checking tasks: 5.6

Evidence required:
- Official-registry MCP server selected and installed to Claude through the MCP
  registry UI/service path.
- Redacted install preview captured before confirmation.
- Real Claude run discovers the installed server, lists at least one tool, and
  calls a harmless tool.
- Logs/renderer state show no plaintext token, authorization header, or secret.

Current status:
- Claude registry browse/install/check are implemented, but the real Claude run
  and tool-call evidence are still missing in this sandbox.
