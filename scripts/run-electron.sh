#!/bin/bash

# Script to run Electron directly with the built app
# Usage: ./scripts/run-electron.sh

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Run Electron with the app
exec "$PROJECT_ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$PROJECT_ROOT/out/main/index.js"
