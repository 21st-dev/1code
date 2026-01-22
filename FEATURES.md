# 1Code Features Documentation

Complete guide to all features in 1Code desktop application.

## Table of Contents

- [Core Features](#core-features)
- [Text Selection](#text-selection)
- [Custom Slash Commands](#custom-slash-commands)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Model Selection](#model-selection)
- [Git Integration](#git-integration)
- [Worktree Isolation](#worktree-isolation)
- [Terminal](#terminal)
- [Windows Support](#windows-support)

---

## Core Features

### Plan Mode vs Agent Mode

**Plan Mode** (Read-only):
- Claude analyzes your codebase and creates implementation plans
- No file modifications
- Asks clarifying questions before planning
- Perfect for design reviews and architecture discussions
- Command: `/plan <your request>`

**Agent Mode** (Full permissions):
- Claude can execute bash commands, edit files, and make changes
- Real-time tool execution visibility
- Requires approval for certain operations
- Command: `/agent <your request>` or just type your message

### Chat Sessions

- **Workspaces**: Link local project folders
- **Chats**: Individual conversations within a workspace
- **Sub-chats**: Branched conversations (tabs) within a chat
- **Archive**: Hide completed chats without deleting them

---

## Text Selection (v0.0.27+)

Select and reference text from any code block or diff in Claude's responses.

### How to Use

1. **Select text** from any code block or diff view
2. **Actions appear**:
   - Copy text to clipboard
   - Use in reply (adds as context to your next message)
3. **Visual indicators** show selected text context

### Where It Works

- ✅ Code blocks in Claude's responses
- ✅ Diff views (inline and side-by-side)
- ✅ File edit previews
- ✅ Bash tool output

### Implementation Details

- Selection preserved when switching between chats
- Context automatically formatted for Claude
- Supports multiple selections (merged in reply)

---

## Custom Slash Commands (v0.0.30+)

Create your own slash commands with custom prompts.

### Creating Commands

**Location:**
- User-level: `~/.claude/commands/*.md`
- Project-level: `{project}/.claude/commands/*.md`

**Format:**
```markdown
---
description: "Brief description for autocomplete"
argument-hint: "Optional hint for arguments"
---

Your custom prompt template goes here.

Use {{argument}} to reference user input.
```

### Namespaces

Organize commands in subdirectories:

```
.claude/commands/
├── test.md              → /test
├── git/
│   ├── commit.md        → /git:commit
│   └── rebase.md        → /git:rebase
└── ops/
    └── deploy/
        └── staging.md   → /ops:deploy:staging
```

### Examples

**Write Tests** (`~/.claude/commands/test.md`):
```markdown
---
description: "Write comprehensive tests"
argument-hint: "file path or selection"
---

Write comprehensive unit tests for the following code, including:
- Edge cases
- Error handling
- Mock external dependencies

{{argument}}
```

**Git Commit** (`~/.claude/commands/git/commit.md`):
```markdown
---
description: "Generate commit message from staged changes"
---

Please review the staged changes and generate a clear, descriptive commit message following conventional commits format (feat/fix/chore).

Include:
1. Type and scope
2. Brief summary (50 chars max)
3. Detailed description if needed
```

**Code Review** (`{project}/.claude/commands/review.md`):
```markdown
---
description: "Review code for best practices"
argument-hint: "file or PR number"
---

Review the following code for:
- Security issues
- Performance concerns
- Code style consistency
- Best practices

{{argument}}
```

### Usage

1. Type `/` in chat input to see available commands
2. Commands from both user and project directories appear
3. Select command or type namespace (e.g., `/git:commit`)
4. Add arguments if the command supports them

---

## Keyboard Shortcuts (v0.0.30+)

Fully customizable keyboard shortcuts with conflict detection.

### Accessing Settings

1. Open Settings (Cmd+,)
2. Go to "Keyboard" tab
3. Browse shortcuts by category

### Categories

**General:**
- `?` - Show shortcuts help
- `Cmd+,` - Open settings
- `Cmd+B` - Toggle sidebar
- `Cmd+Z` - Undo archive

**Workspaces:**
- `Cmd+N` - New workspace
- `Cmd+K` - Search workspaces
- `Cmd+Shift+Backspace` - Archive workspace
- `Cmd+P` - Quick switch workspaces

**Agents:**
- `Cmd+Shift+N` - New agent
- `Cmd+F` - Search in chat
- `Cmd+Shift+F` - Search chats
- `Cmd+Shift+Backspace` - Archive agent
- `Cmd+J` - Quick switch agents
- `Cmd+[` or `Cmd+Alt+Left` - Previous agent
- `Cmd+]` or `Cmd+Alt+Right` - Next agent
- `Cmd+L` - Focus input
- `Shift+Esc` - Stop generation
- `Cmd+E` - Switch model
- `Cmd+T` - Toggle terminal
- `Cmd+D` - Open diff/changes
- `Cmd+Shift+P` - Create PR

### Customizing Shortcuts

1. Click on a shortcut row
2. Press "Record" button
3. Press your desired key combination
4. Save or cancel
5. Conflicts are automatically detected and shown

### Reset

- **Reset one**: Click reset icon next to shortcut
- **Reset all**: Click "Reset all to defaults" button

### Storage

Custom shortcuts are stored in localStorage at:
```
Key: custom-hotkeys-config
Format: { version: 1, bindings: { actionId: "keys" } }
```

---

## Model Selection (v0.0.28+)

Choose which Claude model to use for each chat.

### Available Models

- **Claude Opus 4.5** - Most capable, best for complex tasks
- **Claude Sonnet 4.5** - Balanced performance and speed
- **Claude Haiku** - Fastest, best for simple tasks

### Switching Models

1. Click model selector dropdown in chat input area
2. Select desired model
3. New messages use selected model
4. Model preference saved per chat

### Extended Thinking Toggle

Enable or disable extended thinking mode:
1. Open model selector dropdown
2. Toggle "Extended Thinking" option
3. When enabled, Claude spends more time reasoning before responding

---

## Git Integration

Full Git client integrated into the UI.

### Changes View

**Open:** Cmd+D or click "Changes" in sidebar

**Features:**
- ✅ File list with diff previews
- ✅ Stage/unstage files
- ✅ Commit with message
- ✅ Push to remote
- ✅ Force push (with confirmation)
- ✅ Create pull request
- ✅ View file history

### Viewed Files Tracking (v0.0.27+)

GitHub-style file review tracking:
- Press `V` to mark file as viewed
- Checkmark appears next to viewed files
- Persisted across sessions
- Useful for large changesets

### Diff View Modes

1. **Inline** - Traditional unified diff
2. **Side-by-side** - Split view
3. **Full page** - Dedicated diff view

All modes support text selection for referencing specific changes.

---

## Worktree Isolation

Each chat runs in its own Git worktree for safety.

### How It Works

1. Create new chat in workspace
2. App creates isolated worktree branch
3. Claude's changes happen in worktree
4. Review changes in Changes view
5. Merge or discard as needed

### Benefits

- **Never touch main branch** during development
- **Multiple chats** can work simultaneously
- **Easy cleanup** - delete chat = delete worktree
- **Branch safety** - no accidental commits to protected branches

### Settings

Configure in Settings → Project Worktree:
- Enable/disable worktree isolation
- Set worktree location
- Configure branch naming

---

## Terminal

Integrated terminal with full shell access.

### Opening Terminal

- **Keyboard**: Cmd+T
- **UI**: Click terminal icon in bottom bar

### Features

- Full shell access (bash, zsh, fish)
- Multiple terminal tabs
- Persistent across sessions
- Working directory follows current project
- Platform-specific shell detection (Windows: PowerShell/CMD)

### Windows Support

Terminal automatically detects and uses:
- PowerShell (preferred)
- Command Prompt (fallback)

---

## Windows Support (v0.0.29+)

Experimental Windows support with platform-specific adaptations.

### What Works

- ✅ Core chat functionality
- ✅ File operations
- ✅ Terminal (PowerShell/CMD)
- ✅ Custom title bar
- ✅ Git operations
- ✅ Claude Code execution

### Platform Differences

**Title Bar:**
- Custom title bar on Windows (native controls hidden)
- Window controls integrated into app UI

**Terminal:**
- Uses PowerShell or CMD instead of bash
- Path handling adjusted for Windows paths

**File Paths:**
- Automatic conversion between Windows and Unix paths
- Uses `os.homedir()` instead of `process.env.HOME`

### Known Issues

- Some Git operations may be slower
- Worktree isolation not as robust as macOS/Linux
- Auto-updates not yet tested on Windows

### Building for Windows

```bash
bun run build
bun run package:win
```

Produces:
- NSIS installer (.exe)
- Portable version (.zip)

---

## Additional Features

### Desktop Notifications (v0.0.29+)

Get notified when Claude finishes responding in background chats:
- Only for chats not currently visible
- Click notification to open chat
- Can be disabled in system settings

### Archive Popover

Quick view of archived chats:
- Shows file count for each chat
- One-click restore
- Permanent delete option
- Search within archive

### Hover to Select (v0.0.30+)

Quick switch dialogs now select items on hover:
- Faster navigation
- No click required
- Arrow keys still work

### Auto-Updates

Automatic update checking and installation:
- Checks on app start
- Checks when window regains focus (1 min cooldown)
- Downloads in background
- One-click install and restart

---

## Tips & Tricks

### Workflow Tips

1. **Use Plan Mode first** for large changes to get a roadmap
2. **Create sub-chats** to try different approaches without cluttering main chat
3. **Mark files as viewed** in Changes view to track review progress
4. **Create custom commands** for frequently repeated tasks
5. **Use text selection** to reference specific parts of Claude's responses

### Performance Tips

1. **Close unused sub-chats** to reduce memory usage
2. **Archive old chats** to keep workspace list clean
3. **Use keyboard shortcuts** for faster navigation
4. **Enable extended thinking** only for complex reasoning tasks

### Organization Tips

1. **Use namespaced commands** to organize custom prompts
2. **Create project-specific commands** for team consistency
3. **Use worktree isolation** to safely experiment
4. **Name chats descriptively** for easier navigation

---

## Troubleshooting

### Commands Not Appearing

1. Check file locations: `~/.claude/commands/` or `{project}/.claude/commands/`
2. Ensure files have `.md` extension
3. Verify frontmatter format
4. Restart app to refresh command list

### Keyboard Shortcuts Not Working

1. Check for conflicts in Settings → Keyboard
2. Verify shortcut is properly saved
3. Try resetting to defaults
4. Check if another app is capturing the shortcut

### Worktree Issues

1. Check Settings → Project Worktree configuration
2. Ensure Git is installed and accessible
3. Verify project is a Git repository
4. Check for existing worktree conflicts

### Windows-Specific Issues

1. Ensure PowerShell is available
2. Check file paths use backslashes
3. Run as administrator if permission issues occur
4. Check antivirus isn't blocking operations

---

## Feature Requests & Bug Reports

Join our [Discord](https://discord.gg/8ektTZGnj4) or open an issue on GitHub.

When reporting bugs, include:
- 1Code version (Help → About)
- Operating system and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable
