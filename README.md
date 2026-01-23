# kcode

Best UI for Claude Code with local and remote agent execution.

By [Kosal](https://kosal.io)

> **Note:** Currently tested on macOS and Linux. Windows support is experimental and may have issues.

## Features

### Run Claude agents the right way

Run agents locally, in worktrees, in background — without touching main branch.

- **Git Worktree Isolation** - Each chat session runs in its own isolated worktree
- **Background Execution** - Run agents in background while you continue working
- **Local-first** - All code stays on your machine, no cloud sync required
- **Branch Safety** - Never accidentally commit to main branch

---

### UI that finally respects your code

Cursor-like UI for Claude Code with diff previews, built-in git client, and the ability to see changes before they land.

- **Diff Previews** - See exactly what changes Claude is making in real-time
- **Built-in Git Client** - Stage, commit, and manage branches without leaving the app
- **Change Tracking** - Visual diffs and PR management
- **Real-time Tool Execution** - See bash commands, file edits, and web searches as they happen

---

### Plan mode that actually helps you think

Claude asks clarifying questions, builds structured plans, and shows clean markdown preview — all before execution.

- **Clarifying Questions** - Claude asks what it needs to know before starting
- **Structured Plans** - See step-by-step breakdown of what will happen
- **Clean Markdown Preview** - Review plans in readable format
- **Review Before Execution** - Approve or modify the plan before Claude acts

---

### More Features

- **Plan & Agent Modes** - Read-only analysis or full code execution permissions
- **Project Management** - Link local folders with automatic Git remote detection
- **Integrated Terminal** - Full terminal access within the app

## Installation

### Build from source

```bash
# Prerequisites: Bun, Python, Xcode Command Line Tools (macOS)
bun install
bun run claude:download  # Download Claude binary (required!)
bun run build
bun run package:mac  # or package:win, package:linux
```

> **Important:** The `claude:download` step downloads the Claude CLI binary which is required for the agent chat to work. If you skip this step, the app will build but agent functionality won't work.

## Configuration

kcode uses Azure Claude API credentials. On first launch, you'll need to configure:

1. **Endpoint** - Your Azure OpenAI endpoint (e.g., `https://your-resource.openai.azure.com`)
2. **API Key** - Your Azure API key
3. **Deployment Name** - Your Claude model deployment name

These credentials are stored securely using your system's keychain.

## Development

```bash
bun install
bun run claude:download  # First time only
bun run dev
```

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.
