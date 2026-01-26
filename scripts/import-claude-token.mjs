#!/usr/bin/env node
/**
 * Import Claude OAuth token directly
 * Usage: bun run scripts/import-claude-token.mjs <token>
 * 
 * Note: This requires the app to be running and uses the tRPC endpoint.
 * For direct database import, see the alternative method below.
 */

const token = process.argv[2]

if (!token) {
  console.error("Usage: bun run scripts/import-claude-token.mjs <token>")
  console.error("\nExample:")
  console.error('  bun run scripts/import-claude-token.mjs "your-token-here"')
  process.exit(1)
}

console.log("⚠️  This script requires the app to be running.")
console.log("📝 Alternative: Use the UI in Settings → Agents → Claude Code")
console.log("   Click 'Or paste token manually' and paste your token there.\n")

console.log("Token to import:", token.slice(0, 20) + "...")
console.log("\n💡 To import via UI:")
console.log("   1. Open the app")
console.log("   2. Go to Settings → Agents → Claude Code")
console.log("   3. Click 'Or paste token manually'")
console.log("   4. Paste your token and click Import")
