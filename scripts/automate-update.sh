#!/bin/bash
# Automate 1Code Update Process
# Updates dependencies, builds, and optionally restarts the app

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

function print_step() {
    echo -e "${YELLOW}▶ $1${NC}"
}

function print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

function print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# Parse arguments
RESTART_APP=false
SKIP_BUILD=false
SKIP_CLEANUP=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --restart)
            RESTART_APP=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --skip-cleanup)
            SKIP_CLEANUP=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --restart      Restart Electron app after update"
            echo "  --skip-build   Skip building the app"
            echo "  --skip-cleanup Skip cleaning up processes/ports"
            echo "  --help, -h     Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

print_header "🔄 1Code Update Automation"

# Step 1: Check Git status
print_step "Checking Git status..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Step 2: Pull latest changes
print_step "Pulling latest changes from remote..."
if git pull; then
    print_success "Git pull completed"
else
    print_error "Git pull failed"
    exit 1
fi

# Step 3: Cleanup processes and ports (if not skipped)
if [ "$SKIP_CLEANUP" = false ]; then
    print_step "Cleaning up processes and ports..."
    
    # Kill Electron processes
    pkill -f "electron-vite|electron.*1code" 2>/dev/null && print_success "Killed Electron processes" || echo "No Electron processes found"
    
    # Free ports
    lsof -ti:21321 | xargs kill -9 2>/dev/null && print_success "Freed port 21321" || echo "Port 21321 already free"
    lsof -ti:5173 | xargs kill -9 2>/dev/null && print_success "Freed port 5173" || echo "Port 5173 already free"
    lsof -ti:9229 | xargs kill -9 2>/dev/null && print_success "Freed port 9229" || echo "Port 9229 already free"
    
    sleep 1
    print_success "Cleanup complete"
else
    echo "Skipping cleanup (--skip-cleanup)"
fi

# Step 4: Install dependencies
print_step "Installing dependencies..."
if bun install; then
    print_success "Dependencies installed"
else
    print_error "Dependency installation failed"
    exit 1
fi

# Step 5: Build (if not skipped)
if [ "$SKIP_BUILD" = false ]; then
    print_step "Building application..."
    if bun run build; then
        print_success "Build completed successfully"
        
        # Verify build output
        if [ -f "out/main/index.js" ]; then
            BUILD_SIZE=$(ls -lh out/main/index.js | awk '{print $5}')
            print_success "Build output verified ($BUILD_SIZE)"
        else
            print_error "Build output not found"
            exit 1
        fi
    else
        print_error "Build failed"
        exit 1
    fi
else
    echo "Skipping build (--skip-build)"
fi

# Step 6: Restart app (if requested)
if [ "$RESTART_APP" = true ]; then
    print_step "Restarting Electron app..."
    sleep 1
    bun run dev &
    APP_PID=$!
    sleep 3
    
    # Check if app started
    if ps -p $APP_PID > /dev/null; then
        print_success "App started (PID: $APP_PID)"
    else
        print_error "App failed to start"
        exit 1
    fi
fi

# Summary
print_header "✅ Update Complete"

echo "Summary:"
echo "  • Git: Pulled latest changes"
if [ "$SKIP_CLEANUP" = false ]; then
    echo "  • Cleanup: Processes and ports cleaned"
fi
echo "  • Dependencies: Installed"
if [ "$SKIP_BUILD" = false ]; then
    echo "  • Build: Completed"
fi
if [ "$RESTART_APP" = true ]; then
    echo "  • App: Restarted"
fi

echo ""
echo "Next steps:"
echo "  • Press F5 in VS Code to start debugging"
echo "  • Or run: bun run dev"
echo ""
