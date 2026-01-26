# Development Automation Scripts

**Last Updated:** January 26, 2026

## 🚀 Quick Start

```bash
# Make scripts executable (one time)
chmod +x scripts/automate-*.sh

# Run automation
./scripts/automate-dev-workflow.sh start
```

## 📋 Available Scripts

### 1. `automate-dev-workflow.sh` - Main Workflow Automation

**Purpose:** Automate common development tasks

**Usage:**
```bash
./scripts/automate-dev-workflow.sh [command]
```

**Commands:**
- `start` / `dev` - Start Electron app
- `build` - Build application
- `test` - Run type checking
- `db:migrate` - Generate database migration
- `db:push` - Push database schema
- `db:studio` - Open Drizzle Studio
- `clean` - Clean build artifacts
- `restart` - Restart Electron app
- `setup` - Setup development environment
- `review` - Generate GitHub review
- `mcp` - Check MCP servers
- `all` / `full` - Run full workflow

**Examples:**
```bash
# Start app
./scripts/automate-dev-workflow.sh start

# Restart app
./scripts/automate-dev-workflow.sh restart

# Full workflow
./scripts/automate-dev-workflow.sh all

# Show menu
./scripts/automate-dev-workflow.sh
```

### 2. `automate-dev-setup.sh` - Environment Setup

**Purpose:** Verify and setup development environment

**Checks:**
- Bun installation
- Python installation
- Node.js installation
- Dependencies
- Claude binary
- VS Code configuration
- Git setup

**Usage:**
```bash
./scripts/automate-dev-setup.sh
```

### 3. `automate-github-review.sh` - GitHub Review

**Purpose:** Generate automated GitHub repository review

**Generates:**
- Repository statistics
- Commit history
- Contributor information
- Branch status
- File changes

**Usage:**
```bash
./scripts/automate-github-review.sh
```

**Output:** `GITHUB_REPO_AUTO_REVIEW_YYYYMMDD_HHMMSS.md`

### 4. `automate-mcp-check.sh` - MCP Server Check

**Purpose:** Check MCP server status and configuration

**Checks:**
- MCP directory structure
- Available servers
- GitHub token configuration
- SuperMemory access

**Usage:**
```bash
./scripts/automate-mcp-check.sh
```

## 🔧 Integration with VS Code

### Add to Tasks

You can add these to `.vscode/tasks.json`:

```json
{
  "label": "automate: Start App",
  "type": "shell",
  "command": "./scripts/automate-dev-workflow.sh start",
  "group": "build"
},
{
  "label": "automate: Full Workflow",
  "type": "shell",
  "command": "./scripts/automate-dev-workflow.sh all",
  "group": "build"
}
```

### Add to Launch Configurations

You can reference scripts in `.vscode/launch.json`:

```json
{
  "name": "Run Electron (Automated)",
  "type": "node",
  "request": "launch",
  "runtimeExecutable": "./scripts/automate-dev-workflow.sh",
  "runtimeArgs": ["start"]
}
```

## 📝 Usage Examples

### Daily Development
```bash
# Quick start
./scripts/automate-dev-workflow.sh start

# Restart if needed
./scripts/automate-dev-workflow.sh restart
```

### Before Committing
```bash
# Full check
./scripts/automate-dev-workflow.sh all

# Generate review
./scripts/automate-dev-workflow.sh review
```

### Setup New Environment
```bash
# Verify setup
./scripts/automate-dev-setup.sh

# Check MCP servers
./scripts/automate-mcp-check.sh
```

## 🎯 Workflow Integration

### Pre-commit Hook (Optional)

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
./scripts/automate-dev-workflow.sh test
```

### CI/CD Integration

These scripts can be used in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Setup
  run: ./scripts/automate-dev-setup.sh

- name: Build
  run: ./scripts/automate-dev-workflow.sh build

- name: Test
  run: ./scripts/automate-dev-workflow.sh test
```

## 🔍 Script Details

### Error Handling
- All scripts use `set -e` for error handling
- Commands fail fast on errors
- Clear error messages

### Output Formatting
- Color-coded output
- Clear section headers
- Progress indicators

### Cross-Platform
- Works on macOS, Linux, Windows (with Git Bash)
- Uses standard shell commands
- Path-agnostic where possible

## 📚 Related Documentation

- `QUICK_START.md` - Quick start guide
- `.vscode/README.md` - VS Code configuration
- `.vscode/DEBUG_GUIDE.md` - Debugging guide

---

**Automation ready!** Use `./scripts/automate-dev-workflow.sh` to get started. 🚀
