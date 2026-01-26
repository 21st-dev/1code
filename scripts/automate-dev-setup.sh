#!/bin/bash
# Automate Development Environment Setup
# Sets up the development environment and verifies everything is ready

set -e

echo "🚀 1Code Development Environment Setup"
echo "======================================="
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."

# Check Bun
if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    echo "✅ Bun installed: $BUN_VERSION"
else
    echo "❌ Bun not found. Install from https://bun.sh"
    exit 1
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version)
    echo "✅ Python installed: $PYTHON_VERSION"
else
    echo "⚠️  Python not found (required for Claude binary)"
fi

# Check Node.js (for electron-rebuild)
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js installed: $NODE_VERSION"
else
    echo "⚠️  Node.js not found"
fi

echo ""

# Install dependencies
echo "📦 Installing dependencies..."
if [ ! -d "node_modules" ]; then
    echo "   Running: bun install"
    bun install
else
    echo "✅ Dependencies already installed"
fi

echo ""

# Download Claude binary
echo "🤖 Checking Claude binary..."
if [ ! -f "resources/bin/VERSION" ] && [ ! -d "resources/bin" ]; then
    echo "   Downloading Claude binary..."
    bun run claude:download
else
    echo "✅ Claude binary found"
fi

echo ""

# Check VS Code configuration
echo "⚙️  Checking VS Code configuration..."
if [ -d ".vscode" ]; then
    echo "✅ VS Code config found"
    if [ -f ".vscode/launch.json" ]; then
        echo "✅ Launch configurations found"
    fi
    if [ -f ".vscode/tasks.json" ]; then
        echo "✅ Task configurations found"
    fi
else
    echo "⚠️  .vscode directory not found"
fi

echo ""

# Check database
echo "💾 Checking database setup..."
if [ -f "drizzle.config.ts" ]; then
    echo "✅ Drizzle config found"
else
    echo "⚠️  Drizzle config not found"
fi

echo ""

# Verify git setup
echo "🔧 Checking git setup..."
if [ -d ".git" ]; then
    REMOTE=$(git remote get-url origin 2>/dev/null || echo "Not configured")
    BRANCH=$(git branch --show-current)
    echo "✅ Git repository"
    echo "   Remote: $REMOTE"
    echo "   Branch: $BRANCH"
else
    echo "⚠️  Not a git repository"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Next steps:"
echo "   1. Run: bun run dev"
echo "   2. Or press F5 in VS Code and select 'Run Electron Desktop'"
echo ""
