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

## Legacy ACP-shaped built-app DOM smoke

Command:

```sh
ROOT="/private/tmp/locus-codex-acp-removal-20260622-162755"
LOCUS_USER_DATA_DIR="$ROOT/user-data" \
ELECTRON_RENDERER_URL="file://$PWD/out/renderer/index.html" \
PATH="/opt/homebrew/bin:$PATH" \
./node_modules/.bin/electron out/main/probe-legacy-acp-render-built.cjs
```

Result: passed.

- The probe used isolated Electron user data, seeded a persisted Codex chat with
  prior ACP-shaped tool parts, and opened the existing sub-chat through the
  product `window.desktopApi.newWindow({ chatId, subChatId })` path.
- The seeded chat included `worktreePath` set to
  `/Users/ethan/Code/GitHub/agent-code-for-me`, matching the project workspace
  path required by `ChatView` for project-backed chats.
- The built renderer created the Codex `ACPChatTransport` wrapper for the
  app-server provider path and mounted the existing sub-chat in `window-2`.
- The DOM proof output was:

```text
newWindow-result:{"blocked":false}
containsUserPrompt: true
containsReadTool: true
containsReadFile: true
containsBashOutput: true
```

- The captured body text included the seeded user prompt
  `legacy acp render probe`, the rendered read tool target `README.md`, the
  rendered command `$ echo legacy-acp-render-ok`, and command output
  `legacy-acp-render-ok`.
- The main-process `chats.get` response for the same window returned the seeded
  `subChats[0].messages` JSON and normal timestamp values such as
  `2026-06-22T04:27:56.000Z`.
