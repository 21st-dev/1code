> **⚠️ Fork Notice:** This is a personal fork of [21st-dev/1code](https://github.com/21st-dev/1code) maintained by [@aletc1](https://github.com/aletc1). It includes additional features and fixes not yet merged upstream. For the official release, visit the [original repository](https://github.com/21st-dev/1code).

# 1Code

[1Code.dev](https://1code.dev)

Open-source coding agent client. Run Claude Code, Codex, and more - locally or in the cloud.

By [21st.dev](https://21st.dev) team

## Fork Additions

Enhancements added in this fork on top of upstream:

### Workflow & UI

- **Split View with Drag-to-Split** - Drag a sub-chat from the sidebar to create or extend a split-view layout; per-pane close button in the title bar
- **Cmd+Shift+T: New Sub-Chat in Split** - Dedicated shortcut (and tooltip) that opens a new sub-chat directly into split view
- **Sortable Sidebar** - Reorder chats in the sidebar via drag-and-drop (@dnd-kit), with a grab-cursor + grip-handle hint on hover
- **Draggable Tab Bar** - Native HTML5 drag-and-drop on tabs with an insertion marker; split pairs stay locked
- **Queue Reorder** - Drag to reorder queued messages before they're sent
- **Text-Selection Copy Popover** - Copy button appears when you highlight text inside a chat message
- **Optimistic Sub-Chat Creation** - New sub-chats appear instantly and roll back on RPC failure
- **Per-Mode Thinking Effort** - Set Claude's thinking budget independently for Plan and Agent modes
- **Per-Mode Default Models** - Configure a default model per mode with automatic switching on mode change
- **Usage Statistics** - Built-in page showing Claude + Codex token and cost tracking
- **Wider Chat Column** - Expanded chat area (max-w-4xl) for better readability
- **Enter / Shift+Enter Swap** - Enter submits, Shift+Enter inserts a newline (matches common conventions)

### Git, PRs & Worktrees

- **PR Widget with Comments** - Inline PR status, comments, and details alongside the chat
- **Branch Switcher Popover** - Switch branches from a popover in the changes panel; PR chip refreshes immediately on switch (no more 30-second polling wait)
- **PR Auto-Refresh on Commit/Push** - PR status updates automatically when you commit or push from the app
- **Two-Column Commit Diff** - Side-by-side diff view for commit contents
- **Pull & Push Recovery Dialog** - When `git push` fails because the remote is ahead, a one-click dialog auto-stashes, rebases, and re-pushes instead of surfacing a raw "non-fast-forward" error
- **Worktree Deletion Safety** - Worktrees are only removed when you explicitly opt in via the archive flow with the "Delete worktree" checkbox; project delete and app startup no longer auto-remove worktrees

### Models

- **Latest Claude Models** - Opus 4.7 and updated model list including the latest Claude releases
- **Sonnet 4.6 1M Context** - Full 1M-token context for Sonnet (`sonnet[1m]`) alongside the existing Opus 1M, with an amber "1M · higher cost" badge in the selector
- **One-Click 1M Recovery** - On rate-limit or context errors against a 1M model, the toast action becomes "Switch to \<base model\>" — one click moves the sub-chat back to the 200K variant
- **GPT-5.4 & GPT-5.4 Mini** - Latest Codex models registered as the default; gpt-5.3-codex remains available

### Stability & Polish

- **Rich Tool Rendering** - Proper icons and labels for `Skill`, `ScheduleWakeup`, `EnterPlanMode`, `Cron*`, `Monitor`, `PushNotification`, `TaskOutput`/`TaskStop`, `EnterWorktree`/`ExitWorktree`, `RemoteTrigger`, and `ToolSearch` (previously rendered as plain text)
- **Stream Wedge Timeout** - 90-second first-chunk timeout aborts and surfaces a `STREAM_WEDGE` error instead of hanging the UI indefinitely
- **Crash Auto-Recovery** - App-root error boundary + one-shot auto-reload (10s debounce) for IPC race crashes, so you get a visible error state instead of a black screen
- **Session Abort on Delete** - In-flight Claude sessions are aborted before their workspace is removed on project/chat/sub-chat delete
- **Lazy Archive Popover** - Archive queries no longer fire until the popover opens, reducing startup network chatter
- **Windows Git Path Fix** - POSIX-normalized git paths so the sidebar tree view works on Windows

---

## Highlights

- **Multi-Agent Support** - Claude Code and Codex in one app, switch instantly
- **Visual UI** - Cursor-like desktop app with diff previews and real-time tool execution
- **Custom Models & Providers (BYOK)** - Bring your own API keys
- **Git Worktree Isolation** - Each chat runs in its own isolated worktree
- **Background Agents** - Cloud sandboxes that run when your laptop sleeps
- **Live Browser Previews** - Preview dev branches in a real browser
- **Kanban Board** - Visualize agent sessions
- **Built-in Git Client** - Visual staging, diffs, PR creation, push to GitHub
- **File Viewer** - File preview with Cmd+P search and image viewer
- **Integrated Terminal** - Sidebar or bottom panel with Cmd+J toggle
- **Model Selector** - Switch between models and providers
- **MCP & Plugins** - Server management, plugin marketplace, rich tool display
- **Automations** - Trigger agents from GitHub, Linear, Slack, or manually from git events
- **Chat Forking** - Fork a sub-chat from any assistant message
- **Message Queue** - Queue prompts while an agent is working
- **API** - Run agents programmatically with a single API call
- **Voice Input** - Hold-to-talk dictation
- **Plan Mode** - Structured plans with markdown preview
- **Extended Thinking** - Enabled by default with visual UX
- **Skills & Slash Commands** - Custom skills and slash commands
- **Custom Sub-agents** - Visual task display in sidebar
- **Memory** - CLAUDE.md and AGENTS.md support
- **PWA** - Start and monitor background agents from your phone
- **Cross Platform** - macOS desktop, web app, Windows and Linux

## Features

### Run coding agents the right way

Run agents locally, in worktrees, in background - without touching main branch.

![Worktree Demo](assets/worktree.gif)

- **Git Worktree Isolation** - Each chat session runs in its own isolated worktree
- **Background Execution** - Run agents in background while you continue working
- **Local-first** - All code stays on your machine, no cloud sync required
- **Branch Safety** - Never accidentally commit to main branch
- **Shared Terminals** - Share terminal sessions across local-mode workspaces

---

### UI that finally respects your code

Cursor-like UI with diff previews, built-in git client, and the ability to see changes before they land.

![Cursor UI Demo](assets/cursor-ui.gif)

- **Diff Previews** - See exactly what changes the agent is making in real-time
- **Built-in Git Client** - Stage, commit, push to GitHub, and manage branches without leaving the app
- **Git Activity Badges** - See git operations directly on agent messages
- **Rollback** - Roll back changes from any user message bubble
- **Real-time Tool Execution** - See bash commands, file edits, and web searches as they happen
- **File Viewer** - File preview with Cmd+P search, syntax highlighting, and image viewer
- **Chat Forking** - Fork a sub-chat from any assistant message to explore alternatives
- **Chat Export** - Export conversations for sharing or archival
- **File Mentions** - Reference files directly in chat with @ mentions
- **Message Queue** - Queue up prompts while an agent is working

---

### Plan mode that actually helps you think

The agent asks clarifying questions, builds structured plans, and shows clean markdown preview - all before execution.

![Plan Mode Demo](assets/plan-mode.gif)

- **Clarifying Questions** - The agent asks what it needs to know before starting
- **Structured Plans** - See step-by-step breakdown of what will happen
- **Clean Markdown Preview** - Review plans in readable format
- **Review Before Execution** - Approve or modify the plan before the agent acts
- **Extended Thinking** - Enabled by default with visual thinking gradient
- **Sub-agents** - Visual task list for sub-agents in the details sidebar

---

### Background agents that never sleep

Close your laptop. Your agents keep running in isolated cloud sandboxes with live browser previews.

- **Runs When You Sleep** - Background agents continue working even when your laptop is closed
- **Cloud Sandboxes** - Every background session runs in an isolated cloud environment
- **Live Browser Previews** - See your dev branch running in a real browser

---

### Connect anything with MCP

Full MCP server lifecycle management with a built-in plugin marketplace. No config files needed.

- **MCP Server Management** - Toggle, configure, and delete MCP servers from the UI
- **Plugin Marketplace** - Browse and install plugins with one click
- **Rich Tool Display** - See MCP tool calls with formatted inputs and outputs
- **@ Mentions** - Reference MCP servers directly in chat input

---

### Automations that work while you sleep

Trigger agents from GitHub, Linear, Slack, or manually from git events. Auto-review PRs, fix CI failures, and complete tasks - all configurable.

- **@1code Triggers** - Tag @1code in GitHub, Linear, or Slack to start agents
- **Git Event Triggers** - Run automations on push, PR, or any git event
- **Conditions & Filters** - Control when automations fire
- **Execution Timeline** - Visual history of past runs
- **Silent Mode** - Toggle respond-to-trigger for background automations

Automations require a [Pro or Max subscription](https://1code.dev/pro). Learn more at [1code.dev/agents/async](https://1code.dev/agents/async).


## API

Run coding agents programmatically. Point at a repo, give it a task - the agent runs in a sandbox and delivers a PR.

```bash
curl -X POST https://1code.dev/api/v1/tasks \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "repository": "https://github.com/your-org/your-repo",
    "prompt": "Fix the failing CI tests"
  }'
```

- **Remote Sandboxes** - Isolated cloud environment, repo cloned, dependencies installed
- **Git & PR Integration** - Agent commits, pushes branches, opens PRs automatically
- **Async Execution** - Fire and forget, poll for status or get notified
- **Follow-up Messages** - Send additional instructions to a running task

Learn more at [1code.dev/agents/api](https://1code.dev/agents/api)

## Installation

### Option 1: Build from source (free)

```bash
# Prerequisites: Bun, Python 3.11, setuptools, Xcode Command Line Tools (macOS)
bun install
bun run claude:download  # Download Claude binary (required!)
bun run codex:download   # Download Codex binary (required!)
bun run build
bun run package:mac  # or package:win, package:linux
```

> **Important:** The `claude:download` and `codex:download` steps download required agent binaries. If you skip them, the app may build but agent functionality will not work correctly.
>
> **Python note:** Python 3.11 is recommended for native module rebuilds. On Python 3.12+, make sure `setuptools` is installed (`pip install setuptools`).

### Option 2: Subscribe to 1code.dev (recommended)

Get pre-built releases + background agents support by subscribing at [1code.dev](https://1code.dev).

Your subscription helps us maintain and improve 1Code.

## Development

```bash
bun install
bun run claude:download  # First time only
bun run codex:download   # First time only
bun run dev
```

## Feedback & Community

Join our [Discord](https://discord.gg/8ektTZGnj4) for support and discussions.

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
