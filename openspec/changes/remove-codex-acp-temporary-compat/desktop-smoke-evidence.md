# Desktop Smoke Evidence

Date: 2026-06-22

Change: `remove-codex-acp-temporary-compat`

## App-server provider-plan smoke

Command:

```sh
ROOT="/private/tmp/locus-codex-acp-removal-20260622-154953"
PATH="/opt/homebrew/bin:$PATH" \
LOCUS_USER_DATA_DIR="$ROOT/user-data" \
CODEX_HOME="$ROOT/codex-home" \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --auth=chatgpt \
  --model=gpt-5.5 \
  --scenario=provider-plan \
  --project=/Users/ethan/Code/GitHub/agent-code-for-me \
  --out="$ROOT/evidence-provider-plan"
```

Result: passed.

- Local mode loaded without hosted auth.
- Runtime source: Codex app-server.
- Job `mqoog03s9aujtnsc` succeeded.
- Stream included `session-init`, `runtime-status`, `start-step`, 11
  `text-delta` events, `message-metadata`, and `finish`.
- Final text included `LOCUS_PROVIDER_TEXT_DELTA_OK_20260612`.
- MCP readiness reported `codex_apps` ready, 1/1 servers.

## Guarded approval smoke

Command:

```sh
ROOT="/private/tmp/locus-codex-acp-removal-20260622-154953"
OUT="$PWD/.tmp-app-server-smoke/evidence/remove-acp-compat-guarded-20260622-155035"
PATH="/opt/homebrew/bin:$PATH" \
LOCUS_USER_DATA_DIR="$ROOT/user-data-guarded-project" \
CODEX_HOME="$ROOT/codex-home" \
./node_modules/.bin/electron .tmp-app-server-smoke/smoke-codex-app-server-desktop.cjs \
  --auth=chatgpt \
  --model=gpt-5.5 \
  --scenario=guarded-approve \
  --project=/Users/ethan/Code/GitHub/agent-code-for-me \
  --out="$OUT"
```

Result: passed.

- Local mode loaded without hosted auth.
- Runtime source: Codex app-server.
- Job `mqoogvzu1ihe9fnl` succeeded.
- Stream included `guard-event`, `ask-user-question`, and
  `ask-user-question-result`.
- Approval bridge surfaced one `Run command` approval.
- Guarded canary file was created at
  `.tmp-app-server-smoke/evidence/remove-acp-compat-guarded-20260622-155035/canary-guarded-approve.txt`
  with content `app-server-desktop-approved-edit`.

## Legacy ACP-shaped render regression

Command:

```sh
PATH="/opt/homebrew/bin:$PATH" /opt/homebrew/bin/bun test tests/assistant-message-render-parts.test.ts
```

Result: passed.

- The test covers the actual renderer path split:
  `normalizePersistedChatMessages(...)` hydrates legacy ACP-shaped persisted
  parts, then `normalizeAssistantMessagePartsForRender(...)` applies the
  render-time `AssistantMessageItem` normalization.
- Legacy `tool-Read README.md` parts reach render as `tool-Read` with
  `input.file_path = "README.md"` and preserved output.
- Legacy `tool-acp.acp_provider_agent_dynamic_tool` Bash proxy parts reach
  render as `tool-Bash` with `input.command = "echo legacy-acp-render-ok"` and
  preserved output.

## Remaining desktop DOM proof gap

The built-app renderer probe successfully started Electron with isolated
`LOCUS_USER_DATA_DIR`, loaded local mode, created a second product window via
`window.desktopApi.newWindow({ chatId, subChatId })`, and logged:

```text
newWindow-result:{"blocked":false}
[App] Opening chat from window params: legacy-acp-render-chat legacy-acp-render-sub-chat
```

However, the page body did not include the seeded user message or tool output
within the probe timeout. The DOM showed the sidebar and an empty mounted
ChatView shell. This is not counted as successful full desktop DOM render proof.
