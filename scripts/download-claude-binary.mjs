#!/usr/bin/env node
/**
 * Downloads Claude Code native binaries for bundling with the Electron app.
 *
 * Usage:
 *   node scripts/download-claude-binary.mjs           # Download for current platform
 *   node scripts/download-claude-binary.mjs --all     # Download all platforms
 *   node scripts/download-claude-binary.mjs --version 2.1.5  # Specific version
 */

import fs from "node:fs"
import path from "node:path"
import https from "node:https"
import crypto from "node:crypto"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, "..")
const BIN_DIR = path.join(ROOT_DIR, "resources", "bin")

// Claude Code distribution base URL
const DIST_BASE =
  "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases"

// Platform mappings
const PLATFORMS = {
  "darwin-arm64": { dir: "darwin-arm64", binary: "claude" },
  "darwin-x64": { dir: "darwin-x64", binary: "claude" },
  "linux-arm64": { dir: "linux-arm64", binary: "claude" },
  "linux-x64": { dir: "linux-x64", binary: "claude" },
  "win32-x64": { dir: "win32-x64", binary: "claude.exe" },
}

/**
 * Fetch JSON from URL
 */
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return fetchJson(res.headers.location).then(resolve).catch(reject)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }
        let data = ""
        res.on("data", (chunk) => (data += chunk))
        res.on("end", () => resolve(JSON.parse(data)))
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

/**
 * Download file with progress
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)

    const request = (url) => {
      https
        .get(url, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            file.close()
            fs.unlinkSync(destPath)
            return request(res.headers.location)
          }

          if (res.statusCode !== 200) {
            file.close()
            fs.unlinkSync(destPath)
            return reject(new Error(`HTTP ${res.statusCode}`))
          }

          const totalSize = parseInt(res.headers["content-length"], 10)
          let downloaded = 0
          let lastPercent = 0

          res.on("data", (chunk) => {
            downloaded += chunk.length
            const percent = Math.floor((downloaded / totalSize) * 100)
            if (percent !== lastPercent && percent % 10 === 0) {
              process.stdout.write(`\r  Progress: ${percent}%`)
              lastPercent = percent
            }
          })

          res.pipe(file)

          file.on("finish", () => {
            file.close()
            process.stdout.write("\r  Progress: 100%\n")
            resolve()
          })

          res.on("error", (err) => {
            file.close()
            fs.unlinkSync(destPath)
            reject(err)
          })
        })
        .on("error", (err) => {
          file.close()
          fs.unlinkSync(destPath)
          reject(err)
        })
    }

    request(url)
  })
}

/**
 * Calculate SHA256 hash of file
 */
function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256")
    const stream = fs.createReadStream(filePath)
    stream.on("data", (chunk) => hash.update(chunk))
    stream.on("end", () => resolve(hash.digest("hex")))
    stream.on("error", reject)
  })
}

/**
 * Get latest version from manifest
 */
async function getLatestVersion() {
  // Try to fetch version list or use known latest
  // For now, we'll fetch the manifest for a known version
  console.log("Fetching latest Claude Code version...")

  try {
    // The install script endpoint returns version info
    const response = await fetch("https://claude.ai/install.sh")
    const script = await response.text()
    const versionMatch = script.match(/CLAUDE_CODE_VERSION="([^"]+)"/)
    if (versionMatch) {
      return versionMatch[1]
    }
  } catch {
    // Fallback
  }

  // Fallback to known version
  return "2.1.5"
}

/**
 * Download binary for a specific platform
 */
async function downloadPlatform(version, platformKey, manifest) {
  const platform = PLATFORMS[platformKey]
  if (!platform) {
    console.error(`Unknown platform: ${platformKey}`)
    return false
  }

  const targetDir = path.join(BIN_DIR, platformKey)
  const targetPath = path.join(targetDir, platform.binary)

  // Create directory
  fs.mkdirSync(targetDir, { recursive: true })

  // Get expected hash from manifest
  const platformManifest = manifest.platforms[platform.dir]
  if (!platformManifest) {
    console.error(`No manifest entry for ${platform.dir}`)
    return false
  }

  const expectedHash = platformManifest.checksum
  const downloadUrl = `${DIST_BASE}/${version}/${platform.dir}/${platform.binary}`

  console.log(`\nDownloading Claude Code for ${platformKey}...`)
  console.log(`  URL: ${downloadUrl}`)
  console.log(`  Size: ${(platformManifest.size / 1024 / 1024).toFixed(1)} MB`)

  // Check if already downloaded with correct hash
  if (fs.existsSync(targetPath)) {
    const existingHash = await calculateSha256(targetPath)
    if (existingHash === expectedHash) {
      console.log(`  Already downloaded and verified`)
      return true
    }
    console.log(`  Existing file has wrong hash, re-downloading...`)
  }

  // Download
  await downloadFile(downloadUrl, targetPath)

  // Verify hash
  const actualHash = await calculateSha256(targetPath)
  if (actualHash !== expectedHash) {
    console.error(`  Hash mismatch!`)
    console.error(`    Expected: ${expectedHash}`)
    console.error(`    Actual:   ${actualHash}`)
    fs.unlinkSync(targetPath)
    return false
  }
  console.log(`  Verified SHA256: ${actualHash.substring(0, 16)}...`)

  // Make executable (Unix)
  if (process.platform !== "win32") {
    fs.chmodSync(targetPath, 0o755)
  }

  console.log(`  Saved to: ${targetPath}`)
  return true
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2)
  const downloadAll = args.includes("--all")
  const versionArg = args.find((a) => a.startsWith("--version="))
  const specifiedVersion = versionArg?.split("=")[1]

  console.log("Claude Code Binary Downloader")
  console.log("=============================\n")

  // Get version
  const version = specifiedVersion || (await getLatestVersion())
  console.log(`Version: ${version}`)

  // Fetch manifest
  const manifestUrl = `${DIST_BASE}/${version}/manifest.json`
  console.log(`Fetching manifest: ${manifestUrl}`)

  let manifest
  try {
    manifest = await fetchJson(manifestUrl)
  } catch (error) {
    console.error(`Failed to fetch manifest: ${error.message}`)
    process.exit(1)
  }

  // Determine which platforms to download
  let platformsToDownload
  if (downloadAll) {
    platformsToDownload = Object.keys(PLATFORMS)
  } else {
    // Current platform only
    const currentPlatform = `${process.platform}-${process.arch}`
    if (!PLATFORMS[currentPlatform]) {
      console.error(`Unsupported platform: ${currentPlatform}`)
      console.log(`Supported platforms: ${Object.keys(PLATFORMS).join(", ")}`)
      process.exit(1)
    }
    platformsToDownload = [currentPlatform]
  }

  console.log(`\nPlatforms to download: ${platformsToDownload.join(", ")}`)

  // Create bin directory
  fs.mkdirSync(BIN_DIR, { recursive: true })

  // Write version file
  fs.writeFileSync(
    path.join(BIN_DIR, "VERSION"),
    `${version}\n${new Date().toISOString()}\n`
  )

  // Download each platform
  let success = true
  for (const platform of platformsToDownload) {
    const result = await downloadPlatform(version, platform, manifest)
    if (!result) success = false
  }

  if (success) {
    console.log("\n✓ All downloads completed successfully!")
  } else {
    console.error("\n✗ Some downloads failed")
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
