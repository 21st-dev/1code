#!/usr/bin/env node

/**
 * Generate fallback GitHub Releases manifest files.
 *
 * Locus uses electron-updater for packaged macOS and Windows NSIS installs.
 * These manifests remain release attachment metadata for manual/fallback checks;
 * electron-builder publish metadata is the production updater feed.
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs
 *   node scripts/generate-update-manifest.mjs --release-dir ./release
 *
 * The script accepts current friend-build names and electron-builder defaults:
 *   - Locus-{version}-arm64-friend.zip
 *   - Locus-{version}-arm64-mac.zip
 *   - Locus-{version}-friend.zip
 *   - Locus-{version}-mac.zip
 *   - Locus-Setup-{version}.exe
 *   - Locus-{version}-portable.exe
 */

import { createHash } from "crypto"
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs"
import { join, dirname, basename } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function readArg(name) {
  const assignment = process.argv.find((arg) => arg.startsWith(`${name}=`))
  if (assignment) {
    return assignment.slice(name.length + 1)
  }

  const index = process.argv.indexOf(name)
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1]
  }

  return null
}

// Parse --channel argument (default: "latest")
const channel = readArg("--channel") ?? "latest"

if (channel !== "latest" && channel !== "beta") {
  console.error(`Invalid channel: "${channel}". Must be "latest" or "beta".`)
  process.exit(1)
}

// Get version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "../package.json"), "utf-8")
)
const version = readArg("--version") ?? process.env.VERSION ?? packageJson.version

const releaseDir = readArg("--release-dir") ?? join(__dirname, "../release")

/**
 * Calculate SHA512 hash of a file and return base64 encoded string
 */
function calculateSha512(filePath) {
  const content = readFileSync(filePath)
  return createHash("sha512").update(content).digest("base64")
}

/**
 * Get file size in bytes using stat (more efficient than reading entire file)
 */
function getFileSize(filePath) {
  return statSync(filePath).size
}

/**
 * Find file matching one of the candidate patterns and extension in release directory
 */
function findReleaseFile(patterns, ext = ".zip") {
  if (!existsSync(releaseDir)) {
    console.error(`Release directory not found: ${releaseDir}`)
    process.exit(1)
  }

  const files = readdirSync(releaseDir)
  const candidates = Array.isArray(patterns) ? patterns : [patterns]

  for (const pattern of candidates) {
    const match = files.find((f) => f.includes(pattern) && f.endsWith(ext))
    if (match) {
      return {
        path: join(releaseDir, match),
        matchedPattern: pattern,
      }
    }
  }

  return null
}

function formatPatterns(patterns) {
  return patterns.map((pattern) => `"${pattern}"`).join(", ")
}

function getMacArtifactPatterns(arch) {
  if (arch === "arm64") {
    return [
      `${version}-arm64-friend`,
      `${version}-arm64-mac`,
      `${version}-arm64`,
    ]
  }

  return [
    `${version}-x64-friend`,
    `${version}-x64-mac`,
    `${version}-mac`,
    `${version}-friend`,
  ]
}

/**
 * Generate manifest for a specific architecture
 */
function generateManifest(arch) {
  const patterns = getMacArtifactPatterns(arch)
  const zipMatch = findReleaseFile(patterns, ".zip")

  if (!zipMatch) {
    console.warn(
      `Warning: ZIP file not found for ${arch}; tried ${formatPatterns(patterns)}`
    )
    console.warn(`Skipping ${arch} manifest generation`)
    return null
  }

  const zipPath = zipMatch.path
  const zipName = basename(zipPath)
  const sha512 = calculateSha512(zipPath)
  const size = getFileSize(zipPath)

  // Keep the YAML shape compatible with release metadata tools, but do not wire
  // it to automatic installation in the app.
  const manifest = {
    version,
    files: [
      {
        url: zipName,
        sha512,
        size,
      },
    ],
    path: zipName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  // Stable channel: latest-mac.yml / latest-mac-x64.yml
  // Beta channel: beta-mac.yml / beta-mac-x64.yml
  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName =
    arch === "arm64" ? `${prefix}-mac.yml` : `${prefix}-mac-x64.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  // Convert to YAML format (simple implementation)
  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${zipName}`)
  console.log(`  Matched: ${zipMatch.matchedPattern}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log(`  SHA512: ${sha512.substring(0, 20)}...`)
  console.log()

  const dmgMatch = findReleaseFile(patterns, ".dmg")

  return {
    manifestPath,
    artifactName: zipName,
    manualDownloadName: dmgMatch ? basename(dmgMatch.path) : null,
  }
}

function getWindowsInstallerPatterns() {
  return [
    `Locus-Setup-${version}`,
    `Setup-${version}`,
    `Setup ${version}`,
    `${version}-Setup`,
    `${version}-setup`,
  ]
}

function generateWindowsManifest() {
  const installerMatch = findReleaseFile(getWindowsInstallerPatterns(), ".exe")

  if (!installerMatch) {
    console.warn(
      `Warning: Windows installer not found; tried ${formatPatterns(
        getWindowsInstallerPatterns(),
      )}`,
    )
    console.warn("Skipping Windows manifest generation")
    return null
  }

  const installerPath = installerMatch.path
  const installerName = basename(installerPath)
  const sha512 = calculateSha512(installerPath)
  const size = getFileSize(installerPath)
  const portableMatch = findReleaseFile(
    [`Locus-${version}-portable`, `${version}-portable`, `portable-${version}`],
    ".exe",
  )

  const manifest = {
    version,
    files: [
      {
        url: installerName,
        sha512,
        size,
      },
    ],
    path: installerName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName = `${prefix}.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${installerName}`)
  console.log(`  Matched: ${installerMatch.matchedPattern}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log(`  SHA512: ${sha512.substring(0, 20)}...`)
  console.log()

  return {
    manifestPath,
    artifactName: installerName,
    manualDownloadName: portableMatch ? basename(portableMatch.path) : null,
  }
}

/**
 * Convert object to YAML string (simple implementation)
 */
function objectToYaml(obj, indent = 0) {
  const spaces = "  ".repeat(indent)
  let yaml = ""

  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) {
      yaml += `${spaces}${key}:\n`
      for (const item of value) {
        if (typeof item === "object") {
          yaml += `${spaces}  - `
          const itemYaml = objectToYaml(item, 0)
            .split("\n")
            .filter(Boolean)
            .map((line, i) => (i === 0 ? line : `${spaces}    ${line}`))
            .join("\n")
          yaml += itemYaml + "\n"
        } else {
          yaml += `${spaces}  - ${item}\n`
        }
      }
    } else if (typeof value === "object" && value !== null) {
      yaml += `${spaces}${key}:\n`
      yaml += objectToYaml(value, indent + 1)
    } else {
      yaml += `${spaces}${key}: ${value}\n`
    }
  }

  return yaml
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

/**
 * Generate manifest for Linux AppImage
 */
function generateLinuxManifest() {
  const appImageMatch = findReleaseFile(`${version}`, ".AppImage")

  if (!appImageMatch) {
    console.warn(`Warning: AppImage file not found for version: ${version}`)
    console.warn(`Skipping Linux manifest generation`)
    return null
  }

  const appImagePath = appImageMatch.path
  const appImageName = basename(appImagePath)
  const sha512 = calculateSha512(appImagePath)
  const size = getFileSize(appImagePath)

  const manifest = {
    version,
    files: [
      {
        url: appImageName,
        sha512,
        size,
      },
    ],
    path: appImageName,
    sha512,
    releaseDate: new Date().toISOString(),
  }

  const prefix = channel === "beta" ? "beta" : "latest"
  const manifestFileName = `${prefix}-linux.yml`
  const manifestPath = join(releaseDir, manifestFileName)

  const yaml = objectToYaml(manifest)
  writeFileSync(manifestPath, yaml)

  console.log(`Generated ${manifestFileName}:`)
  console.log(`  Version: ${version}`)
  console.log(`  File: ${appImageName}`)
  console.log(`  Size: ${formatBytes(size)}`)
  console.log(`  SHA512: ${sha512.substring(0, 20)}...`)
  console.log()

  return {
    manifestPath,
    artifactName: appImageName,
  }
}

// Main execution
console.log("=".repeat(50))
console.log("Generating manual GitHub Releases manifests")
console.log("=".repeat(50))
console.log(`Version: ${version}`)
console.log(`Channel: ${channel}`)
console.log(`Release dir: ${releaseDir}`)
console.log()

const arm64Manifest = generateManifest("arm64")
const x64Manifest = generateManifest("x64")
const windowsManifest = generateWindowsManifest()
const linuxManifest = generateLinuxManifest()

if (!arm64Manifest && !x64Manifest && !windowsManifest && !linuxManifest) {
  console.error("No manifest files were generated!")
  console.error("Make sure you have built the app with: npm run dist")
  process.exit(1)
}

console.log("=".repeat(50))
console.log("Manifest generation complete!")
console.log()
const prefix = channel === "beta" ? "beta" : "latest"
console.log("Next steps:")
console.log("1. Attach the following files to the GitHub Release:")
if (arm64Manifest) {
  console.log(`   - ${prefix}-mac.yml`)
  console.log(`   - ${arm64Manifest.artifactName}`)
  if (arm64Manifest.manualDownloadName) {
    console.log(`   - ${arm64Manifest.manualDownloadName}`)
  }
}
if (x64Manifest) {
  console.log(`   - ${prefix}-mac-x64.yml`)
  console.log(`   - ${x64Manifest.artifactName}`)
  if (x64Manifest.manualDownloadName) {
    console.log(`   - ${x64Manifest.manualDownloadName}`)
  }
}
if (windowsManifest) {
  console.log(`   - ${prefix}.yml`)
  console.log(`   - ${windowsManifest.artifactName}`)
  if (windowsManifest.manualDownloadName) {
    console.log(`   - ${windowsManifest.manualDownloadName}`)
  }
}
if (linuxManifest) {
  console.log(`   - ${prefix}-linux.yml`)
  console.log(`   - ${linuxManifest.artifactName}`)
}
console.log("2. Publish release notes on GitHub Releases")
console.log("3. Keep installation/download steps user-initiated")
console.log("=".repeat(50))
