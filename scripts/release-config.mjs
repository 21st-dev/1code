import fs from "node:fs"
import path from "node:path"

export function getMacArtifactNames({ productName, version }) {
  return {
    arm64Zip: `${productName}-${version}-arm64-mac.zip`,
    x64Zip: `${productName}-${version}-mac.zip`,
    arm64Dmg: `${productName}-${version}-arm64.dmg`,
    x64Dmg: `${productName}-${version}.dmg`,
  }
}

export function getConfiguredReleaseUploadTarget(env = process.env) {
  const configuredBaseUrl = env.OPENCODEX_UPDATE_BASE_URL?.trim()
  if (!configuredBaseUrl) {
    return null
  }

  return configuredBaseUrl.replace(/\/+$/, "")
}

export function getReleaseUploadTargetLabel(env = process.env) {
  return getConfiguredReleaseUploadTarget(env) || "the OPENCODEX_UPDATE_BASE_URL target"
}

export function getConfiguredWebBaseUrl(env = process.env) {
  const configuredBaseUrl = env.OPENCODEX_WEB_URL?.trim()
  if (!configuredBaseUrl) {
    return null
  }

  return configuredBaseUrl.replace(/\/+$/, "")
}

export function getReleaseWebTargetLabel(env = process.env) {
  return getConfiguredWebBaseUrl(env) || "the OPENCODEX_WEB_URL host"
}

export function assessPackagingReadiness({ env = process.env, rootDir }) {
  const issues = []

  for (const pkg of ["electron-vite", "electron-builder"]) {
    const pkgPath = path.join(rootDir, "node_modules", pkg, "package.json")
    if (!fs.existsSync(pkgPath)) {
      issues.push(`Missing installed dependency: ${pkg}`)
    }
  }

  if (!getConfiguredReleaseUploadTarget(env)) {
    issues.push("Missing required release env: OPENCODEX_UPDATE_BASE_URL")
  }

  if (!getConfiguredWebBaseUrl(env)) {
    issues.push("Missing required packaged web env: OPENCODEX_WEB_URL")
  }

  return {
    ok: issues.length === 0,
    issues,
  }
}

export function getManifestNextStepLines({
  env = process.env,
  channel = "latest",
  macArtifactNames,
  hasArm64Manifest,
  hasX64Manifest,
}) {
  const prefix = channel === "beta" ? "beta" : "latest"
  const lines = [
    `1. Confirm packaged hosts: web=${getReleaseWebTargetLabel(env)}, updates=${getReleaseUploadTargetLabel(env)}`,
    `2. Upload the following files to ${getReleaseUploadTargetLabel(env)}:`,
  ]

  if (hasArm64Manifest) {
    lines.push(`   - ${prefix}-mac.yml`)
    lines.push(`   - ${macArtifactNames.arm64Zip}`)
    lines.push(`   - ${macArtifactNames.arm64Dmg} (for manual download)`)
  }

  if (hasX64Manifest) {
    lines.push(`   - ${prefix}-mac-x64.yml`)
    lines.push(`   - ${macArtifactNames.x64Zip}`)
    lines.push(`   - ${macArtifactNames.x64Dmg} (for manual download)`)
  }

  lines.push("3. Create a release entry in the admin dashboard")
  return lines
}

export function collectReleaseUploadPlan({ env = process.env, productName, version, releaseDir }) {
  const targetBaseUrl = getConfiguredReleaseUploadTarget(env)
  if (!targetBaseUrl) {
    throw new Error("OpenCodex release upload requires OPENCODEX_UPDATE_BASE_URL to be set.")
  }

  const macArtifacts = getMacArtifactNames({ productName, version })
  const expectedFiles = [
    "latest-linux.yml",
    "latest-mac-x64.yml",
    "latest-mac.yml",
    `${productName}-${version}.AppImage`,
    macArtifacts.arm64Zip,
    macArtifacts.arm64Dmg,
    macArtifacts.x64Zip,
    macArtifacts.x64Dmg,
  ]

  const entries = expectedFiles
    .filter((fileName) => fs.existsSync(path.join(releaseDir, fileName)))
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => ({
      fileName,
      sourcePath: path.join(releaseDir, fileName),
      targetUrl: `${targetBaseUrl}/${fileName}`,
    }))

  if (entries.length === 0) {
    throw new Error(`No release artifacts found in ${releaseDir}. Run the packaging and manifest steps first.`)
  }

  return {
    targetBaseUrl,
    entries,
  }
}