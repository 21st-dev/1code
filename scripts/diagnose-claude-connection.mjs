#!/usr/bin/env node
/**
 * Diagnostic script to check Claude API connection status
 * Run with: bun run scripts/diagnose-claude-connection.mjs
 */

import { Database } from "bun:sqlite"
import { existsSync, statSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { execSync } from "child_process"

// Get database path (same logic as in src/main/lib/db/index.ts)
function getDatabasePath() {
  // In dev, we need to simulate the userData path
  const userDataPath = process.env.USER_DATA_PATH || join(homedir(), "Library", "Application Support", "Agents Dev")
  const dataDir = join(userDataPath, "data")
  return join(dataDir, "agents.db")
}

// Get binary path (same logic as in src/main/lib/claude/env.ts)
function getBundledClaudeBinaryPath() {
  const isDev = !process.env.APP_PACKAGED
  const platform = process.platform
  const arch = process.arch

  // In dev: apps/desktop/resources/bin/{platform}-{arch}/claude
  // In production: {resourcesPath}/bin/claude
  const resourcesPath = isDev
    ? join(process.cwd(), "resources/bin", `${platform}-${arch}`)
    : join(process.resourcesPath, "bin")

  const binaryName = platform === "win32" ? "claude.exe" : "claude"
  return join(resourcesPath, binaryName)
}

// Decrypt token (simplified - uses base64 fallback)
function decryptToken(encrypted) {
  try {
    // Try base64 decode first (fallback when safeStorage not available)
    return Buffer.from(encrypted, "base64").toString("utf-8")
  } catch {
    return null
  }
}

async function diagnose() {
  console.log("🔍 Diagnosing Claude API Connection...\n")
  console.log("=" .repeat(60))

  const issues = []
  const info = []

  // 1. Check database
  console.log("\n1. Checking database...")
  const dbPath = getDatabasePath()
  console.log(`   Database path: ${dbPath}`)

  if (!existsSync(dbPath)) {
    issues.push(`Database not found at: ${dbPath}`)
    console.log("   ❌ Database file does not exist")
  } else {
    console.log("   ✓ Database file exists")
    try {
      const db = new Database(dbPath)
      const query = db.query("SELECT oauth_token FROM claude_code_credentials WHERE id = ?")
      const cred = query.get("default")

      if (!cred || !cred.oauth_token) {
        issues.push("No OAuth token found in database")
        console.log("   ❌ No token in database")
      } else {
        console.log("   ✓ Token found in database")
        const token = decryptToken(cred.oauth_token)
        if (token) {
          console.log(`   ✓ Token decrypted: ${token.slice(0, 10)}...`)
          info.push(`Token length: ${token.length} characters`)
        } else {
          issues.push("Token exists but cannot be decrypted (may need safeStorage)")
          console.log("   ⚠️  Token exists but decryption may require Electron safeStorage")
        }
      }
      db.close()
    } catch (error) {
      issues.push(`Database error: ${error.message}`)
      console.log(`   ❌ Database error: ${error.message}`)
    }
  }

  // 2. Check binary
  console.log("\n2. Checking Claude binary...")
  const binaryPath = getBundledClaudeBinaryPath()
  console.log(`   Binary path: ${binaryPath}`)

  if (!existsSync(binaryPath)) {
    issues.push(`Claude binary not found at: ${binaryPath}`)
    console.log("   ❌ Binary not found")
    console.log("   💡 Run: bun run claude:download")
  } else {
    console.log("   ✓ Binary exists")
    const stats = statSync(binaryPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
    console.log(`   ✓ Binary size: ${sizeMB} MB`)
  }

  // 3. Check network
  console.log("\n3. Checking network connectivity...")
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "HEAD",
      signal: controller.signal,
    })
    clearTimeout(timeout)
    console.log("   ✓ Can reach Anthropic API")
  } catch (error) {
    issues.push("Cannot reach Anthropic API - check internet connection")
    console.log("   ❌ Cannot reach Anthropic API")
    console.log(`   Error: ${error.message}`)
  }

  // 4. Check system token
  console.log("\n4. Checking system credentials...")
  try {
    let systemToken = null
    if (process.platform === "darwin") {
      try {
        const result = execSync(
          'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
          { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
        ).trim()
        if (result) {
          const creds = JSON.parse(result)
          systemToken = creds?.claudeAiOauth?.accessToken || null
        }
      } catch {
        // Not found
      }
    }
    if (systemToken) {
      console.log("   ✓ System token available")
      info.push("System token can be imported")
    } else {
      console.log("   ⚠️  No system token found")
    }
  } catch (error) {
    console.log("   ⚠️  Could not check system credentials")
  }

  // Summary
  console.log("\n" + "=".repeat(60))
  console.log("\n📊 Summary:\n")

  if (issues.length === 0) {
    console.log("✅ All checks passed! Connection should work.")
    if (info.length > 0) {
      console.log("\nℹ️  Additional info:")
      info.forEach((i) => console.log(`   - ${i}`))
    }
  } else {
    console.log("❌ Issues found:\n")
    issues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`)
    })
    console.log("\n💡 Next steps:")
    if (issues.some((i) => i.includes("token"))) {
      console.log("   1. Connect Claude Code in the app settings")
      console.log("   2. Or import token from system: Use 'Import from System' button")
    }
    if (issues.some((i) => i.includes("binary"))) {
      console.log("   1. Download Claude binary: bun run claude:download")
    }
    if (issues.some((i) => i.includes("network"))) {
      console.log("   1. Check your internet connection")
      console.log("   2. Check if Anthropic API is accessible")
    }
  }

  console.log("\n")
}

diagnose().catch((error) => {
  console.error("Diagnostic failed:", error)
  process.exit(1)
})
