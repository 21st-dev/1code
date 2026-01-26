#!/usr/bin/env node

/**
 * DEPRECATED: This script is no longer needed.
 *
 * The build process now properly handles binary paths by downloading
 * all required binaries before building.
 *
 * If you're seeing "Claude Code native binary not found" errors,
 * the proper fix is to rebuild with all binaries:
 *
 *   bun run claude:download:all
 *   bun run build
 *   bun run package:mac
 *
 * See FIX_BINARY.md for details.
 */

console.log('');
console.log('⚠️  This script is deprecated.');
console.log('');
console.log('The build process now properly handles binaries.');
console.log('If you\'re having binary path issues, the correct fix is:');
console.log('');
console.log('  1. Download all platform binaries:');
console.log('     bun run claude:download:all');
console.log('');
console.log('  2. Rebuild the app:');
console.log('     bun run build');
console.log('     bun run package:mac');
console.log('');
console.log('See FIX_BINARY.md for more information.');
console.log('');
process.exit(1);
