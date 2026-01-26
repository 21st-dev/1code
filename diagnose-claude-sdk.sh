#!/bin/bash
# Claude SDK Diagnostic Script
# Usage: ./diagnose-claude-sdk.sh

echo "=== Claude SDK Diagnostics ==="
echo

# 1. Check Claude SDK version
echo "1. Claude SDK Version:"
npm list @anthropic-ai/claude-agent-sdk | grep claude-agent-sdk
echo

# 2. Check binary exists
echo "2. Claude Binary:"
if [ -f "resources/bin/darwin-arm64/claude" ]; then
    ls -lh resources/bin/darwin-arm64/claude
    echo "✓ Binary exists (arm64)"
else
    echo "✗ Binary missing (arm64)"
fi

if [ -f "resources/bin/darwin-x64/claude" ]; then
    ls -lh resources/bin/darwin-x64/claude
    echo "✓ Binary exists (x64)"
else
    echo "✗ Binary missing (x64)"
fi
echo

# 3. Check API key
echo "3. ANTHROPIC_API_KEY:"
if grep -q "ANTHROPIC_API_KEY" .env 2>/dev/null; then
    echo "✓ API key found in .env"
else
    echo "✗ API key missing from .env"
fi
echo

# 4. Check native modules
echo "4. Native Modules:"
if [ -d "node_modules/better-sqlite3/build" ]; then
    echo "✓ better-sqlite3 compiled"
else
    echo "✗ better-sqlite3 needs rebuild"
fi

if [ -d "node_modules/node-pty/build" ]; then
    echo "✓ node-pty compiled"
else
    echo "✗ node-pty needs rebuild"
fi
echo

# 5. Check MCP config
echo "5. MCP Configuration:"
if [ -f ~/.claude.json ]; then
    echo "✓ ~/.claude.json exists"
    plutil -lint ~/.claude.json 2>&1 | head -1
else
    echo "✗ ~/.claude.json missing"
fi
echo

# 6. Check cache
echo "6. Cache Directory:"
CACHE_DIR=~/Library/Application\ Support/Agents\ Dev/cache
if [ -d "$CACHE_DIR" ]; then
    echo "✓ Cache exists: $(du -sh "$CACHE_DIR" 2>/dev/null | cut -f1)"
else
    echo "✗ Cache directory missing"
fi
echo

# 7. Test Claude CLI
echo "7. Claude CLI Test:"
if command -v claude &> /dev/null; then
    echo "✓ Claude CLI installed"
    claude --version 2>&1 | head -1
else
    echo "✗ Claude CLI not in PATH"
fi
echo

echo "=== Diagnostic Complete ==="
echo
echo "Common Fixes:"
echo "  - Missing binary: bun run claude:download"
echo "  - Native modules: npm run postinstall"
echo "  - Clear cache: rm -rf ~/Library/Application\ Support/Agents\ Dev/cache/"
echo "  - Update SDK: bun add @anthropic-ai/claude-agent-sdk@latest"
