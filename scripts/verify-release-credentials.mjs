#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const requireCredentials = process.argv.includes("--require-credentials")
const generatedAt = new Date().toISOString()
const stamp = generatedAt.replace(/[:.]/g, "-")
const reportDir = path.join(root, ".1code/program/release-credentials", stamp)
const reportPath = path.join(reportDir, "report.json")
const latestPath = path.join(root, ".1code/program/release-credentials/latest.json")
const failures = []
const warnings = []
const blockers = []

const requiredCredentials = [
  {
    env: "APPLE_IDENTITY",
    role: "electron-builder Developer ID Application signing identity",
  },
  {
    env: "CSC_LINK",
    role: "Developer ID certificate archive or encoded certificate",
  },
  {
    env: "CSC_KEY_PASSWORD",
    role: "Developer ID certificate password",
  },
  {
    env: "APPLE_ID",
    role: "Apple ID for notarytool",
  },
  {
    env: "APPLE_TEAM_ID",
    role: "Apple Developer Team ID for notarytool",
  },
  {
    env: "APPLE_APP_SPECIFIC_PASSWORD",
    role: "Apple app-specific password for notarytool",
  },
]

const requiredWorkflowSecrets = requiredCredentials.map((credential) => `secrets.${credential.env}`)

function projectPath(relativePath) {
  return path.join(root, relativePath)
}

function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath))
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8")
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath))
  } catch (error) {
    failures.push(`Could not parse ${relativePath}: ${error.message}`)
    return undefined
  }
}

function normalizeRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/")
}

function credentialValueKind(name) {
  const value = process.env[name]
  if (!value) return "missing"
  if (name === "CSC_LINK") {
    if (fs.existsSync(value)) return "file"
    if (/^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length > 80) return "encoded"
  }
  return "env"
}

function runTool(id, command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  })

  return {
    id,
    command,
    args,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    stdoutPreview: (result.stdout ?? "").trim().slice(0, 500),
    stderrPreview: (result.stderr ?? "").trim().slice(0, 500),
  }
}

function listReleaseFiles(pattern) {
  const releaseDir = projectPath("release")
  if (!fs.existsSync(releaseDir)) return []
  return fs.readdirSync(releaseDir)
    .map((name) => path.join(releaseDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => pattern.test(path.basename(filePath)))
    .map(normalizeRelative)
    .sort()
}

const packageJson = readJson("package.json")
const releaseCredentialsScript = packageJson?.scripts?.["release:credentials"]
const releaseCredentialsStrictScript = packageJson?.scripts?.["release:credentials:strict"]
const releaseNotarizeScript = packageJson?.scripts?.["release:notarize"]

if (releaseCredentialsScript !== "node scripts/verify-release-credentials.mjs") {
  failures.push("package.json release:credentials must run scripts/verify-release-credentials.mjs.")
}
if (releaseCredentialsStrictScript !== "node scripts/verify-release-credentials.mjs --require-credentials") {
  failures.push("package.json release:credentials:strict must run scripts/verify-release-credentials.mjs --require-credentials.")
}
if (releaseNotarizeScript !== "node scripts/notarize-release-artifacts.mjs") {
  failures.push("package.json release:notarize must run scripts/notarize-release-artifacts.mjs.")
}
if (!exists("scripts/notarize-release-artifacts.mjs")) {
  failures.push("Missing scripts/notarize-release-artifacts.mjs.")
}

let workflowPresent = false
let workflowRequiredSecrets = []
let workflowCredentialStep = false
if (exists(".github/workflows/moss-desktop-release.yml")) {
  workflowPresent = true
  const workflow = read(".github/workflows/moss-desktop-release.yml")
  workflowRequiredSecrets = requiredWorkflowSecrets.map((secret) => ({
    secret: secret.replace("secrets.", ""),
    present: workflow.includes(secret),
  }))
  workflowCredentialStep = workflow.includes("bun run release:credentials:strict")
  if (!workflowCredentialStep) {
    failures.push(".github/workflows/moss-desktop-release.yml must run bun run release:credentials:strict before packaging.")
  }
  for (const secret of workflowRequiredSecrets) {
    if (!secret.present) {
      failures.push(`.github/workflows/moss-desktop-release.yml is missing required secret contract: ${secret.secret}`)
    }
  }
} else {
  failures.push("Missing .github/workflows/moss-desktop-release.yml.")
}

if (exists("electron-builder.yml")) {
  const builderOverride = read("electron-builder.yml")
  if (!builderOverride.includes("identity: ${env.APPLE_IDENTITY}")) {
    failures.push("electron-builder.yml must read signing identity from APPLE_IDENTITY.")
  }
  if (!builderOverride.includes("notarize: false")) {
    failures.push("electron-builder.yml must keep built-in notarization disabled for explicit CI notarization.")
  }
} else {
  failures.push("Missing electron-builder.yml.")
}

const credentials = requiredCredentials.map((credential) => ({
  ...credential,
  state: process.env[credential.env] ? "set" : "missing",
  valueKind: credentialValueKind(credential.env),
}))
const missingCredentials = credentials
  .filter((credential) => credential.state !== "set")
  .map((credential) => credential.env)

if (missingCredentials.length > 0) {
  blockers.push(`Missing required Apple signing/notarization credentials: ${missingCredentials.join(", ")}.`)
}

const tools = [
  runTool("xcrun-notarytool", "xcrun", ["--find", "notarytool"]),
  runTool("xcrun-stapler", "xcrun", ["--find", "stapler"]),
  runTool("codesign", "xcrun", ["--find", "codesign"]),
  runTool("spctl", "xcrun", ["--find", "spctl"]),
]
const failedTools = tools
  .filter((tool) => tool.status !== "passed")
  .map((tool) => tool.id)

for (const tool of failedTools) {
  failures.push(`Required macOS release tool is unavailable: ${tool}.`)
}

if (requireCredentials && missingCredentials.length > 0) {
  failures.push("Strict release credential preflight requires all Apple signing/notarization credentials.")
}

const status = failures.length > 0
  ? "failed"
  : missingCredentials.length > 0
    ? "blocked"
    : "passed"

if (status === "blocked") {
  warnings.push(...blockers)
}

const report = {
  status,
  generatedAt,
  mode: {
    requireCredentials,
  },
  scripts: {
    releaseCredentials: releaseCredentialsScript,
    releaseCredentialsStrict: releaseCredentialsStrictScript,
    releaseNotarize: releaseNotarizeScript,
  },
  workflow: {
    path: ".github/workflows/moss-desktop-release.yml",
    present: workflowPresent,
    credentialPreflightStep: workflowCredentialStep,
    requiredSecrets: workflowRequiredSecrets,
  },
  signing: {
    electronBuilderIdentity: exists("electron-builder.yml") ? "env.APPLE_IDENTITY" : "missing",
    notarizationMode: "external-ci",
    electronBuilderNotarize: false,
  },
  credentials: {
    required: credentials,
    complete: missingCredentials.length === 0,
    missing: missingCredentials,
  },
  tools: {
    checks: tools,
    complete: failedTools.length === 0,
    missing: failedTools,
  },
  artifacts: {
    macArtifacts: listReleaseFiles(/\.(dmg|zip)$/i),
    updateManifests: listReleaseFiles(/(?:latest|beta)-mac(?:-x64)?\.yml$/),
  },
  warnings,
  blockers,
  failures,
}

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(latestPath, `${JSON.stringify({
  report: normalizeRelative(reportPath),
  generatedAt,
  status,
}, null, 2)}\n`)

console.log("Moss release credential preflight")
console.log(`status: ${status}`)
console.log(`report: ${normalizeRelative(reportPath)}`)
console.log(`credentials: ${credentials.length - missingCredentials.length}/${credentials.length}`)
console.log(`tools: ${tools.length - failedTools.length}/${tools.length}`)

for (const message of warnings) {
  console.warn(`warning: ${message}`)
}
for (const message of failures) {
  console.error(`error: ${message}`)
}

if (failures.length > 0) {
  process.exit(1)
}
