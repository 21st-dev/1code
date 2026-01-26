#!/bin/bash
# Automate MCP Server Status Check
# Checks MCP server availability and configuration

set -e

echo "🔌 MCP Server Status Check"
echo "==========================="
echo ""

# Check MCP directory
MCP_DIR="$HOME/.cursor/projects"
if [ -d "$MCP_DIR" ]; then
    echo "✅ MCP directory found: $MCP_DIR"
    
    # Find project-specific MCP directory
    PROJECT_MCP_DIR=$(find "$MCP_DIR" -name "mcps" -type d 2>/dev/null | head -1)
    
    if [ -n "$PROJECT_MCP_DIR" ]; then
        echo "✅ Project MCP directory found: $PROJECT_MCP_DIR"
        echo ""
        
        # List available servers
        echo "📋 Available MCP Servers:"
        echo ""
        
        for SERVER_DIR in "$PROJECT_MCP_DIR"/*; do
            if [ -d "$SERVER_DIR" ]; then
                SERVER_NAME=$(basename "$SERVER_DIR")
                SERVER_META="$SERVER_DIR/SERVER_METADATA.json"
                
                if [ -f "$SERVER_META" ]; then
                    SERVER_ID=$(grep -o '"serverIdentifier": "[^"]*"' "$SERVER_META" | cut -d'"' -f4 || echo "unknown")
                    echo "  ✅ $SERVER_NAME ($SERVER_ID)"
                else
                    echo "  ⚠️  $SERVER_NAME (no metadata)"
                fi
            fi
        done
    else
        echo "⚠️  Project MCP directory not found"
    fi
else
    echo "⚠️  MCP directory not found: $MCP_DIR"
fi

echo ""

# Check GitHub token (if configured)
echo "🔐 Checking GitHub MCP configuration..."
if [ -n "$GITHUB_TOKEN" ]; then
    echo "✅ GITHUB_TOKEN environment variable set"
else
    echo "⚠️  GITHUB_TOKEN not set"
    echo "   See GITHUB_MCP_SETUP.md for setup instructions"
fi

echo ""

# Check SuperMemory (if accessible)
echo "🧠 Checking SuperMemory access..."
# This would require MCP tool access, so we'll just note it
echo "   Status: Check via MCP tools in Cursor"

echo ""
echo "✅ MCP check complete!"
echo ""
echo "📚 For setup instructions, see:"
echo "   - MCP_SERVERS_ACCESS.md"
echo "   - GITHUB_MCP_SETUP.md"
echo ""
