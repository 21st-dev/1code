#!/usr/bin/env node
/**
 * Downloads Codex CLI native binaries for bundling with the Electron app.
 *
 * Usage:
 *   node scripts/download-codex-binary.mjs              # Download for current platform
 *   node scripts/download-codex-binary.mjs --all        # Download all platforms
 *   node scripts/download-codex-binary.mjs --version=0.98.0
 */

import fs from "node:fs"
import path from "node:path"
import https from "node:https"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.join(__dirname, "..")
const BIN_DIR = path.join(ROOT_DIR, "resources", "bin")

const RELEASE_REPO = "openai/codex"
const RELEASE_TAG_PREFIX = "rust-v"
const USER_AGENT = "opencodex-desktop-codex-downloader"

const PLATFORMS = {
  "darwin-arm64": {
    assetName: "codex-aarch64-apple-darwin.tar.gz",
    extractedBinaryName: "codex-aarch64-apple-darwin",
    outputBinaryName: "codex",
  },
  "darwin-x64": {
    assetName: "codex-x86_64-apple-darwin.tar.gz",
    extractedBinaryName: "codex-x86_64-apple-darwin",
    outputBinaryName: "codex",
  },
  "linux-arm64": {
    assetName: "codex-aarch64-unknown-linux-musl.tar.gz",
    extractedBinaryName: "codex-aarch64-unknown-linux-musl",
    outputBinaryName: "codex",
  },
  "linux-x64": {
    assetName: "codex-x86_64-unknown-linux-musl.tar.gz",
    extractedBinaryName: "codex-x86_64-unknown-linux-musl",
    outputBinaryName: "codex",
  },
  "win32-arm64": {
    assetName: "codex-aarch64-pc-windows-msvc.exe",
    outputBinaryName: "codex.exe",
  },
  "win32-x64": {
    assetName: "codex-x86_64-pc-windows-msvc.exe",
    outputBinaryName: "codex.exe",
  },
}

function getRequestHeaders() {
  const headers = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  }
  // Use GITHUB_TOKEN if available (avoids API rate limits in CI)
  const token = process.env.GITHUB_TOKEN
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: getRequestHeaders() }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location
          if (!redirectUrl) {
            return reject(new Error("Missing redirect location"))
          }
          return fetchJson(redirectUrl).then(resolve).catch(reject)
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`))
        }

        let data = ""
        res.on("data", (chunk) => {
          data += chunk
        })
        res.on("end", () => {
          try {
            resolve(JSON.parse(data))
          } catch (error) {
            reject(error)
          }
        })
        res.on("error", reject)
      })
      .on("error", reject)
  })
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = (nextUrl) => {
      const file = fs.createWriteStream(destPath)

      https
        .get(nextUrl, { headers: getRequestHeaders() }, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const redirectUrl = res.headers.location
            if (!redirectUrl) {
              file.close()
              fs.rmSync(destPath, { force: true })
              return reject(new Error("Missing redirect location"))
            }

            file.close(() => {
              fs.rmSync(destPath, { force: true })
              request(redirectUrl)
            })
            return
          }

          if (res.statusCode !== 200) {
            file.close()
            fs.rmSync(destPath, { force: true })
            return reject(new Error(`HTTP ${res.statusCode}`))
          }

          const totalSize = Number.parseInt(res.headers["content-length"] || "0", 10)
          let downloaded = 0
          let lastPrintedPercent = -1

          res.on("data", (chunk) => {
            downloaded += chunk.length
            if (totalSize <= 0) return

            const percent = Math.floor((downloaded / totalSize) * 100)
            if (percent !== lastPrintedPercent && percent % 10 === 0) {
              process.stdout.write(`\r  Progress: ${percent}%`)
              lastPrintedPercent = percent
            }
          })

          res.pipe(file)

          file.on("finish", () => {
            file.close()
            if (totalSize > 0) {
              process.stdout.write("\r  Progress: 100%\n")
            }
            resolve()
          })

          res.on("error", (error) => {
            file.close()
            fs.rmSync(destPath, { force: true })
            reject(error)
          })
        })
        .on("error", (error) => {
          file.close()
          fs.rmSync(destPath, { force: true })
          reject(error)
        })
    }

    request(url)
  })
}

function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256")
    const stream = fs.createReadStream(filePath)

    stream.on("data", (chunk) => {
      hash.update(chunk)
    })

    stream.on("end", () => {
      resolve(hash.digest("hex"))
    })

    stream.on("error", reject)
  })
}

function parseSha256Digest(rawDigest) {
  if (typeof rawDigest !== "string") return null
  if (!rawDigest.startsWith("sha256:")) return null

  const value = rawDigest.slice("sha256:".length).trim().toLowerCase()
  return value.length > 0 ? value : null
}

function extractTarGz(archivePath, targetDir) {
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", targetDir], {
    stdio: "inherit",
  })

  if (result.status !== 0) {
    throw new Error(`tar extraction failed with code ${result.status ?? "unknown"}`)
  }
}

function getVersionArg(args) {
  const equalsArg = args.find((arg) => arg.startsWith("--version="))
  if (equalsArg) {
    return equalsArg.slice("--version=".length)
  }

  const index = args.indexOf("--version")
  if (index >= 0 && args[index + 1]) {
    return args[index + 1]
  }

  return null
}

async function getLatestVersion() {
  const release = await fetchJson(
    `https://api.github.com/repos/${RELEASE_REPO}/releases/latest`,
  )

  const tagName = typeof release?.tag_name === "string" ? release.tag_name : ""
  if (tagName.startsWith(RELEASE_TAG_PREFIX)) {
    return tagName.slice(RELEASE_TAG_PREFIX.length)
  }

  throw new Error(`Unexpected latest release tag: ${tagName || "<empty>"}`)
}

async function fetchRelease(version) {
  return await fetchJson(
    `https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${RELEASE_TAG_PREFIX}${version}`,
  )
}

function findAsset(release, assetName) {
  const assets = Array.isArray(release?.assets) ? release.assets : []
  return assets.find((asset) => asset?.name === assetName)
}

async function downloadPlatform(version, platformKey, release) {
  const platform = PLATFORMS[platformKey]
  if (!platform) {
    console.error(`Unknown platform: ${platformKey}`)
    return false
  }

  const targetDir = path.join(BIN_DIR, platformKey)
  const targetPath = path.join(targetDir, platform.outputBinaryName)
  const hashMarkerPath = path.join(targetDir, ".codex-asset.sha256")

  fs.mkdirSync(targetDir, { recursive: true })

  const asset = findAsset(release, platform.assetName)
  if (!asset) {
    console.error(`Missing release asset ${platform.assetName}`)
    return false
  }

  const expectedHash = parseSha256Digest(asset.digest)
  const downloadUrl = asset.browser_download_url

  if (!downloadUrl) {
    console.error(`Missing download URL for ${platform.assetName}`)
    return false
  }

  console.log(`\nDownloading Codex for ${platformKey}...`)
  console.log(`  URL: ${downloadUrl}`)
  console.log(`  Size: ${(asset.size / 1024 / 1024).toFixed(1)} MB`)

  if (
    expectedHash &&
    fs.existsSync(targetPath) &&
    fs.existsSync(hashMarkerPath) &&
    fs.readFileSync(hashMarkerPath, "utf8").trim() === expectedHash
  ) {
    console.log("  Already downloaded and verified")
    return true
  }

  const downloadPath = path.join(targetDir, `${platform.assetName}.download`)
  fs.rmSync(downloadPath, { force: true })

  await downloadFile(downloadUrl, downloadPath)

  if (expectedHash) {
    const actualHash = await calculateSha256(downloadPath)
    if (actualHash !== expectedHash) {
      console.error("  Hash mismatch!")
      console.error(`    Expected: ${expectedHash}`)
      console.error(`    Actual:   ${actualHash}`)
      fs.rmSync(downloadPath, { force: true })
      return false
    }
    console.log(`  Verified SHA256: ${actualHash.slice(0, 16)}...`)
  } else {
    console.warn("  Warning: release digest missing, skipping hash verification")
  }

  if (platform.assetName.endsWith(".tar.gz")) {
    const extractDir = path.join(targetDir, ".extract")
    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.mkdirSync(extractDir, { recursive: true })

    extractTarGz(downloadPath, extractDir)

    const extractedPath = path.join(extractDir, platform.extractedBinaryName)
    if (!fs.existsSync(extractedPath)) {
      fs.rmSync(downloadPath, { force: true })
      fs.rmSync(extractDir, { recursive: true, force: true })
      throw new Error(`Extracted binary not found: ${extractedPath}`)
    }

    fs.copyFileSync(extractedPath, targetPath)
    fs.rmSync(extractDir, { recursive: true, force: true })
  } else {
    fs.copyFileSync(downloadPath, targetPath)
  }

  fs.rmSync(downloadPath, { force: true })

  if (!platformKey.startsWith("win32")) {
    fs.chmodSync(targetPath, 0o755)
  }

  if (expectedHash) {
    fs.writeFileSync(hashMarkerPath, `${expectedHash}\n`)
  }

  console.log(`  Saved to: ${targetPath}`)
  return true
}

async function main() {
  const args = process.argv.slice(2)
  const downloadAll = args.includes("--all")
  const specifiedVersion = getVersionArg(args)
  const platformArgIdx = args.indexOf("--platform")
  const platformArgEq = args.find((a) => a.startsWith("--platform="))
  const specifiedPlatform = platformArgEq
    ? platformArgEq.split("=")[1]
    : platformArgIdx >= 0
      ? args[platformArgIdx + 1]
      : null

  console.log("Codex Binary Downloader")
  console.log("=======================\n")

  const version = specifiedVersion || (await getLatestVersion())
  console.log(`Version: ${version}`)

  const release = await fetchRelease(version)

  let platformsToDownload
  if (downloadAll) {
    platformsToDownload = Object.keys(PLATFORMS)
  } else if (specifiedPlatform) {
    if (!PLATFORMS[specifiedPlatform]) {
      console.error(`Unsupported platform: ${specifiedPlatform}`)
      console.log(`Supported platforms: ${Object.keys(PLATFORMS).join(", ")}`)
      process.exit(1)
    }
    platformsToDownload = [specifiedPlatform]
  } else {
    const currentPlatform = `${process.platform}-${process.arch}`
    if (!PLATFORMS[currentPlatform]) {
      console.error(`Unsupported platform: ${currentPlatform}`)
      console.log(`Supported platforms: ${Object.keys(PLATFORMS).join(", ")}`)
      process.exit(1)
    }
    platformsToDownload = [currentPlatform]
  }

  console.log(`\nPlatforms to download: ${platformsToDownload.join(", ")}`)

  fs.mkdirSync(BIN_DIR, { recursive: true })

  let success = true
  for (const platformKey of platformsToDownload) {
    const result = await downloadPlatform(version, platformKey, release)
    if (!result) {
      success = false
    }
  }

  if (!success) {
    console.error("\n✗ Some downloads failed")
    process.exit(1)
  }

  console.log("\n✓ All downloads completed successfully!")
}

main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
