# Quick Chat and Project Sidebar Smoke Evidence

## 2026-06-17 scripted desktop smoke

Reusable helper:

- `scripts/smoke-quick-chat-project-sidebar.ts`

Command shape used:

```bash
bun build scripts/smoke-quick-chat-project-sidebar.ts \
  --target=node \
  --format=cjs \
  --external electron \
  --external node-pty \
  --external better-sqlite3 \
  --external jsonc-parser \
  --outfile smoke-quick-chat-project-sidebar.cjs

LOCUS_USER_DATA_DIR=/tmp/locus-quick-chat-route.JiTxGX \
  node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  smoke-quick-chat-project-sidebar.cjs \
  --profile=mpmoo5eckwcrcshe \
  --source-db=/Users/ethan/Library/Application\ Support/Agent\ Code\ for\ Me\ Dev/data/agents.db \
  --out=.tmp-quick-chat-smoke/evidence/route
```

The smoke used a clean temporary `LOCUS_USER_DATA_DIR`, ran current migrations on
an empty DB, then copied only the selected provider profile row from the dev DB.
The raw evidence JSON was written under ignored `.tmp-quick-chat-smoke/`.

Result summary:

| Check | Result |
| --- | --- |
| Claude folderless quick chat creation | Passed: `projectId = null`, preflight `kind = "folderless"` |
| Claude assistant policy probes | Passed: policy/preflight probes allowed `WebFetch` and denied `Read`, `Bash`, and MCP/project tools |
| Codex folderless quick chat creation | Passed: `projectId = null`, no worktree |
| Codex ACP assistant policy | Passed: shell, file edit, and MCP tool requests returned deny decisions |
| Codex app-server assistant gate | Passed: command and file approvals returned decline; permission expansion denied before execution |
| Uploaded text rewrite | Passed: provider job `succeeded`, 50 text deltas, reply included uploaded marker `LQC_UPLOAD_SOURCE_1781661351040_3e39ah` and referenced Quick Chat |
| Save/download assistant output | Passed: `external.saveTextFile` wrote `assistant-output-smoke.md` via a stubbed save dialog |
| Attach quick chat to project | Passed: attach moved the chat to a temp project, cleared `sessionId`, subsequent preflight `kind = "project"`, project policy control `observe` |
| Sidebar grouping data | Passed: active list contained a null-project quick chat and the attached project chat in the temp project group |
| Quick chat delete | Passed: `chats.delete` removed the quick chat and cascaded sub-chats |
| Workspace archive vs delete | Passed: project workspace archive set `archivedAt`; separate project workspace delete removed the row |

Mobile/fullscreen layout was separately smoke-tested through Electron CDP at
`390x844`: `scrollWidth = 390`, `overflowingCount = 0`, quick composer,
model selector, send button, and `添加代码仓库` were visible; project-only
`Worktree`/`Branch`/`Plan` controls were absent.

## 2026-06-17 Claude SDK denylist hardening

Follow-up review found that the earlier Claude row was policy/preflight evidence,
not a live provider proof that the SDK always calls `canUseTool` for read-only
tools in plan mode.

Implemented a second enforcement layer for assistant quick chat:

- `src/main/lib/agent-runtime/permission-policy.ts` now maps Claude assistant
  runs to SDK-level `sdkDisallowedTools` for known non-web Claude tools:
  `Read`, `Grep`, `Glob`, `LS`, `Bash`, `Write`, `Edit`, `MultiEdit`,
  `NotebookRead`, `NotebookEdit`, `Task`, `TodoRead`, `TodoWrite`, and
  `ExitPlanMode`.
- `src/main/lib/claude/agent-sdk-query-options.ts` passes that list to
  `options.disallowedTools` before SDK query startup, while keeping the existing
  `canUseTool` and `PreToolUse` fail-closed hooks for surfaced unknown/MCP tools.
- Targeted tests assert assistant mappings carry the denylist, web tools are not
  disallowed, every listed tool is denied by the assistant policy, and Claude SDK
  query options include `disallowedTools` for folderless assistant runs but not
  normal project-backed agent runs.

This closes the identified SDK auto-allow gap structurally. It is not recorded
as a live Claude provider tool-call smoke unless a separate run demonstrates the
model attempted `Read` and the SDK rejected it at runtime.

## 2026-06-17 live Claude assistant deny smoke

Reusable helper:

- `scripts/smoke-quick-chat-assistant-deny.cjs`

Command shape:

```bash
node_modules/electron/dist/Electron.app/Contents/MacOS/Electron \
  scripts/smoke-quick-chat-assistant-deny.cjs \
  --target-file=/etc/hosts
```

The smoke runs through the real Claude Agent SDK with the same assistant-tier
configuration used by Locus: `permissionMode: "plan"`, the source-matched
assistant `disallowedTools`, and a `canUseTool` handler that only allows web
information tools. The prompt explicitly asks Claude to use file/shell tooling
to read the target file.

Result summary:

| Check | Result |
| --- | --- |
| Denylist source drift | Passed: helper denylist matched `getClaudeAssistantSdkDisallowedTools()` source entries; `missing = []` |
| SDK advertised tools | Passed: denied file/shell/runtime tools were absent from the SDK-advertised tool list |
| Web tools retained | Passed: `WebFetch` and `WebSearch` remained advertised |
| Denied tool use | Passed: no denied tool produced a `tool_use` block |
| Model-visible result | Passed: Claude replied `NO_FILE_TOOL_AVAILABLE` when asked to read `/etc/hosts` |

This is live provider evidence that the assistant SDK denylist removes known
non-web Claude tools before the model turn, so the assistant path no longer
depends solely on `canUseTool` being called for read-only tools.
