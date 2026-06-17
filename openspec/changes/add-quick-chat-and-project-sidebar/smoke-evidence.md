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
| Claude assistant tool policy | Passed: `WebFetch` allowed; `Read`, `Bash`, and MCP/project tools denied |
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
