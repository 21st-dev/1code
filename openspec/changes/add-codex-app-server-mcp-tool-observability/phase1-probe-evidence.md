# Phase 1 Probe Evidence

Date: 2026-06-22

Change: `add-codex-app-server-mcp-tool-observability`

## Scope

Only Phase 1 was executed. The goal was to prove whether real Codex
app-server exposes a stable post-execution MCP tool result signal after a
harmless MCP tool call. Runtime mapping, registry verification, install UX, and
proof gates were not changed.

## Probe Setup

- Runtime: bundled Codex CLI `0.139.0`
- App-server path: `LOCUS_CODEX_APP_SERVER_ADAPTER=1`
- Auth mode: `chatgpt`
- Model: `gpt-5.5`
- MCP server: generated local `locus_edit` probe server
- MCP tool: `propose_file_edit`
- Server behavior: records JSON-RPC requests and returns a harmless text result;
  it does not write project files.
- Isolation:
  - `HOME=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/home`
  - `CODEX_HOME=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/project/evidence/codex-home`
  - `LOCUS_USER_DATA_DIR=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/user-data`
  - project cwd `/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/project`
- Raw evidence stayed in `/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/project/evidence`.

The temporary `CODEX_HOME` copied only the existing real Codex `auth.json` and
`installation_id` into the isolated directory. Daily `~/.codex` state was not
mutated by the probe.

## Command

```bash
HOME=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/home \
LOCUS_CODEX_APP_SERVER_ADAPTER=1 \
LOCUS_USER_DATA_DIR=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/user-data \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --scenario=locus-edit-adoption \
  --auth=chatgpt \
  --model=gpt-5.5 \
  --project=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/project \
  --out=/private/tmp/locus-codex-app-server-mcp-phase1-20260622-125617/project/evidence \
  --adoption-tier=explicit \
  --inherit-codex-auth=1 \
  --source-codex-home=/Users/ethan/.codex \
  --deny-shell-approvals=1
```

## Observed Signals

- `mcpServerStatus/list` resolved.
- Runtime status reported MCP ready:
  - `serverCount: 2`
  - `readyServerCount: 2`
  - `serverNames: ["codex_apps", "locus_edit"]`
  - `toolNamesByServer.locus_edit: ["propose_file_edit"]`
- Locus chunks included:
  - `session-init`
  - `runtime-status`
  - `start-step`
  - `text-delta`
  - `message-metadata`
  - `ask-user-question`
  - `ask-user-question-result`
  - `finish`
- The probe MCP server JSON-RPC log recorded:
  - `initialize`
  - `notifications/initialized`
  - `tools/list`
  - one `tools/call` request for `propose_file_edit`
- The Locus app-server stream exposed the MCP call as an approval question:
  - `toolUseId: codex-app-server-mcp-elicitation-0`
  - question: `Allow the locus_edit MCP server to run tool "propose_file_edit"?`
  - result: `{ "action": "accept", "content": {} }`

## Missing Signal

No stable post-execution MCP tool output/result signal was observable in the
Locus chunks or persisted runtime events.

Specifically absent from the app-visible evidence:

- No `tool-output-available` equivalent.
- No `tool-output-error` equivalent.
- No app-server event carrying a stable call id plus server/tool/output after
  execution.
- No app-visible payload containing the harmless MCP server result text.
- No event tying the `tools/call` JSON-RPC id `2` to a completed MCP result.

The MCP server's own request log proves Codex called the tool, but that local
server-side log is not an app-server post-execution observability signal that
Locus can use for registry verification.

## Conclusion

Phase 1 did not find the required post-execution tool result signal. Codex
registry `Verified on Codex` must remain deferred. Do not start phases 2-5 until
Codex app-server exposes a stable post-execution MCP result signal, or another
equally strong app-visible proof path is found.

Codex registry installability remains a separate product decision. This Phase 1
result does not justify verified-local upgrades for Codex installs; if Codex
install is later opened without this signal, the UI must explicitly state that
Codex can install but cannot be automatically verified and will remain
`Installed / Unverified` or `Verification deferred`.
