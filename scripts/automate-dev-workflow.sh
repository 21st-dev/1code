#!/bin/bash
# Automate Development Workflow
# Common development tasks automation

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function print_header() {
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}$1${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

function run_command() {
    echo -e "${YELLOW}Running: $1${NC}"
    eval "$1"
    echo ""
}

# Menu
case "${1:-menu}" in
    "start"|"dev")
        print_header "🚀 Starting Electron App"
        run_command "bun run dev"
        ;;
    
    "build")
        print_header "🔨 Building Application"
        run_command "bun run build"
        ;;
    
    "test")
        print_header "🧪 Running Tests"
        echo "Type checking..."
        run_command "bun run ts:check"
        ;;
    
    "db:migrate")
        print_header "💾 Database Migration"
        run_command "bun run db:generate"
        ;;
    
    "db:push")
        print_header "💾 Pushing Database Schema"
        run_command "bun run db:push"
        ;;
    
    "db:studio")
        print_header "💾 Opening Drizzle Studio"
        run_command "bun run db:studio"
        ;;
    
    "clean")
        print_header "🧹 Cleaning Build Artifacts"
        run_command "rm -rf out dist release node_modules/.vite"
        echo "✅ Clean complete"
        ;;
    
    "restart")
        print_header "🔄 Restarting Electron App"
        echo "Stopping existing processes..."
        pkill -f "electron-vite|electron.*1code" || true
        lsof -ti:5173 | xargs kill -9 2>/dev/null || true
        sleep 1
        echo "Starting app..."
        run_command "bun run dev"
        ;;
    
    "setup")
        print_header "⚙️  Setting Up Development Environment"
        run_command "./scripts/automate-dev-setup.sh"
        ;;
    
    "review")
        print_header "📊 Generating GitHub Review"
        run_command "./scripts/automate-github-review.sh"
        ;;
    
    "mcp")
        print_header "🔌 Checking MCP Servers"
        run_command "./scripts/automate-mcp-check.sh"
        ;;
    
    "all"|"full")
        print_header "🔄 Full Development Workflow"
        echo "1. Cleaning..."
        rm -rf out dist release node_modules/.vite 2>/dev/null || true
        echo "2. Installing dependencies..."
        bun install
        echo "3. Building..."
        bun run build
        echo "4. Type checking..."
        bun run ts:check
        echo ""
        echo -e "${GREEN}✅ Full workflow complete!${NC}"
        ;;
    
    "menu"|*)
        echo ""
        echo -e "${GREEN}1Code Development Workflow Automation${NC}"
        echo ""
        echo "Usage: ./scripts/automate-dev-workflow.sh [command]"
        echo ""
        echo "Available commands:"
        echo "  ${YELLOW}start${NC}, ${YELLOW}dev${NC}     - Start Electron app (bun run dev)"
        echo "  ${YELLOW}build${NC}            - Build application"
        echo "  ${YELLOW}test${NC}             - Run type checking"
        echo "  ${YELLOW}db:migrate${NC}       - Generate database migration"
        echo "  ${YELLOW}db:push${NC}          - Push database schema"
        echo "  ${YELLOW}db:studio${NC}        - Open Drizzle Studio"
        echo "  ${YELLOW}clean${NC}            - Clean build artifacts"
        echo "  ${YELLOW}restart${NC}          - Restart Electron app"
        echo "  ${YELLOW}setup${NC}            - Setup development environment"
        echo "  ${YELLOW}review${NC}           - Generate GitHub review"
        echo "  ${YELLOW}mcp${NC}              - Check MCP servers"
        echo "  ${YELLOW}all${NC}, ${YELLOW}full${NC}     - Run full workflow (clean, install, build, test)"
        echo ""
        echo "Examples:"
        echo "  ./scripts/automate-dev-workflow.sh start"
        echo "  ./scripts/automate-dev-workflow.sh restart"
        echo "  ./scripts/automate-dev-workflow.sh all"
        echo ""
        ;;
esac
