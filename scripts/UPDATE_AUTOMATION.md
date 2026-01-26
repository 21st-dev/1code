# 1Code Update Automation

**Last Updated:** January 26, 2026

## 🚀 Quick Start

```bash
# Update everything (git pull, install, build)
bun run automate:update

# Update and restart app
bun run automate:update:restart
```

## 📋 What It Does

The `automate-update.sh` script automates the complete update process:

1. **Git Pull** - Pulls latest changes from remote
2. **Cleanup** - Kills stale processes and frees ports (21321, 5173, 9229)
3. **Install Dependencies** - Runs `bun install`
4. **Build** - Builds the application (`bun run build`)
5. **Restart** (optional) - Restarts Electron app if `--restart` flag is used

## 🎯 Usage

### Basic Update

```bash
bun run automate:update
```

This will:
- Pull latest changes
- Clean up processes/ports
- Install dependencies
- Build the app

### Update and Restart

```bash
bun run automate:update:restart
```

Same as above, but also restarts the Electron app automatically.

### Advanced Options

```bash
# Skip build (faster, but no new build artifacts)
./scripts/automate-update.sh --skip-build

# Skip cleanup (if you know ports are free)
./scripts/automate-update.sh --skip-cleanup

# Combine options
./scripts/automate-update.sh --skip-build --restart
```

## 📝 Options

| Option | Description |
|--------|-------------|
| `--restart` | Restart Electron app after update |
| `--skip-build` | Skip building the app (faster) |
| `--skip-cleanup` | Skip cleaning up processes/ports |
| `--help`, `-h` | Show help message |

## 🔄 Workflow

```
┌─────────────────┐
│  Git Pull       │ ← Pull latest changes
└────────┬────────┘
         │
┌────────▼────────┐
│  Cleanup        │ ← Kill processes, free ports
└────────┬────────┘
         │
┌────────▼────────┐
│  Install Deps   │ ← bun install
└────────┬────────┘
         │
┌────────▼────────┐
│  Build          │ ← bun run build
└────────┬────────┘
         │
┌────────▼────────┐
│  Restart?       │ ← Optional: restart app
└─────────────────┘
```

## 💡 Examples

### Daily Development Update

```bash
# Quick update without restart
bun run automate:update
```

### Full Update with Restart

```bash
# Complete update and restart app
bun run automate:update:restart
```

### Fast Update (Skip Build)

```bash
# Update dependencies only (no build)
./scripts/automate-update.sh --skip-build
```

### Manual Control

```bash
# Update everything, then manually start
bun run automate:update
bun run dev
```

## 🎨 Output

The script provides color-coded output:

- 🔵 **Blue** - Headers and sections
- 🟡 **Yellow** - Current step
- 🟢 **Green** - Success messages
- 🔴 **Red** - Error messages

## ✅ Verification

After running, the script verifies:

- ✅ Git pull completed
- ✅ Ports are free
- ✅ Dependencies installed
- ✅ Build output exists (`out/main/index.js`)
- ✅ App started (if `--restart` used)

## 🔧 Integration

### VS Code Task

You can add this as a VS Code task in `.vscode/tasks.json`:

```json
{
  "label": "update: Update 1Code",
  "type": "shell",
  "command": "bun run automate:update",
  "problemMatcher": []
}
```

### Git Hooks

You could add this to a git hook (e.g., `post-merge`) to auto-update after pulling:

```bash
#!/bin/bash
# .git/hooks/post-merge
bun run automate:update --skip-restart
```

## 📊 Comparison

| Method | Time | Steps | Restart |
|--------|------|-------|---------|
| **Manual** | ~5 min | 5+ | Manual |
| **Automated** | ~2 min | 1 | Optional |
| **Skip Build** | ~1 min | 1 | Optional |

## 🐛 Troubleshooting

### Git Pull Fails

```bash
# Check your branch
git branch --show-current

# Check remote status
git fetch
git status
```

### Build Fails

```bash
# Clean and rebuild
rm -rf out node_modules/.vite
bun run automate:update
```

### Ports Still Occupied

```bash
# Force cleanup
pkill -9 -f electron
lsof -ti:21321 | xargs kill -9
lsof -ti:5173 | xargs kill -9
```

## 📚 Related Scripts

- `automate-dev-workflow.sh` - Development workflow automation
- `automate-dev-setup.sh` - Environment setup
- `automate-github-review.sh` - GitHub repository review
- `automate-mcp-check.sh` - MCP server checks

## 🎯 Best Practices

1. **Before Major Updates**: Commit your work first
2. **After Updates**: Test the app to ensure everything works
3. **Regular Updates**: Run daily or before starting work
4. **With Restart**: Use `--restart` when you want to immediately test

## 📝 Notes

- Script uses `set -e` - exits on any error
- Colors work in most terminals
- Cross-platform (macOS, Linux)
- Safe to run multiple times
