#!/bin/bash

# DEPRECATED: This script is no longer needed.
# The build process now properly handles binary paths.
#
# If you're seeing "Claude Code native binary not found" errors,
# the proper fix is to rebuild with all binaries:
#
#   bun run claude:download:all
#   bun run build
#   bun run package:mac
#
# See FIX_BINARY.md for details.

set -e

echo "⚠️  This script is deprecated."
echo ""
echo "The build process now properly handles binaries."
echo "If you're having binary path issues, the correct fix is:"
echo ""
echo "  1. Download all platform binaries:"
echo "     bun run claude:download:all"
echo ""
echo "  2. Rebuild the app:"
echo "     bun run build"
echo "     bun run package:mac"
echo ""
echo "See FIX_BINARY.md for more information."
echo ""
exit 1
