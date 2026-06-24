#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const requireArtifacts = process.argv.includes("--require-artifacts")
const requireBundledBinaries = process.argv.includes("--require-bundled-binaries")
const requireNotarization = process.argv.includes("--require-notarization")
const requireUploadPlan = process.argv.includes("--require-upload-plan")
const failures = []
const warnings = []

function projectPath(relativePath) {
  return path.join(root, relativePath)
}

function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath))
}

function fail(message) {
  failures.push(message)
}

function warn(message) {
  warnings.push(message)
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8")
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath))
  } catch (error) {
    fail(`Could not parse ${relativePath}: ${error.message}`)
    return undefined
  }
}

function readJsonPath(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    fail(`Could not parse ${normalizeRelative(filePath)}: ${error.message}`)
    return undefined
  }
}

function normalizeRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/")
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function hasScript(packageJson, scriptName) {
  return typeof packageJson?.scripts?.[scriptName] === "string" && packageJson.scripts[scriptName].length > 0
}

function targetFor(macTargets, targetName) {
  return macTargets.find((target) => target?.target === targetName)
}

function includesAll(values, required) {
  return required.every((value) => values.includes(value))
}

function listReleaseFiles() {
  const releaseDir = projectPath("release")
  if (!fs.existsSync(releaseDir)) return []
  return fs.readdirSync(releaseDir)
    .map((name) => path.join(releaseDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort()
}

function workflowText() {
  const workflowPath = ".github/workflows/moss-desktop-release.yml"
  if (!exists(workflowPath)) return undefined
  return read(workflowPath)
}

function includesEvery(text, values) {
  return values.every((value) => text.includes(value))
}

function verifyReleaseWorkflow(packageJson) {
  const workflowPath = ".github/workflows/moss-desktop-release.yml"
  const workflow = workflowText()

  assert(hasScript(packageJson, "release:notarize"), "Missing package script: release:notarize")
  if (packageJson?.scripts?.["release:notarize"] !== "node scripts/notarize-release-artifacts.mjs") {
    fail("package.json release:notarize must run scripts/notarize-release-artifacts.mjs.")
  }
  assert(hasScript(packageJson, "release:credentials"), "Missing package script: release:credentials")
  if (packageJson?.scripts?.["release:credentials"] !== "node scripts/verify-release-credentials.mjs") {
    fail("package.json release:credentials must run scripts/verify-release-credentials.mjs.")
  }
  assert(hasScript(packageJson, "release:credentials:strict"), "Missing package script: release:credentials:strict")
  if (packageJson?.scripts?.["release:credentials:strict"] !== "node scripts/verify-release-credentials.mjs --require-credentials") {
    fail("package.json release:credentials:strict must run scripts/verify-release-credentials.mjs --require-credentials.")
  }
  assert(exists("scripts/verify-release-credentials.mjs"), "Missing scripts/verify-release-credentials.mjs.")
  assert(exists("scripts/notarize-release-artifacts.mjs"), "Missing scripts/notarize-release-artifacts.mjs.")
  assert(hasScript(packageJson, "release:evidence:audit"), "Missing package script: release:evidence:audit")
  if (packageJson?.scripts?.["release:evidence:audit"] !== "node scripts/audit-release-evidence.mjs") {
    fail("package.json release:evidence:audit must run scripts/audit-release-evidence.mjs.")
  }
  assert(exists("scripts/audit-release-evidence.mjs"), "Missing scripts/audit-release-evidence.mjs.")
  assert(hasScript(packageJson, "dist:upload"), "Missing package script: dist:upload")
  if (packageJson?.scripts?.["dist:upload"] !== "node scripts/upload-release.mjs") {
    fail("package.json dist:upload must run scripts/upload-release.mjs.")
  }
  assert(hasScript(packageJson, "dist:upload:dry-run"), "Missing package script: dist:upload:dry-run")
  if (packageJson?.scripts?.["dist:upload:dry-run"] !== "node scripts/upload-release.mjs --dry-run") {
    fail("package.json dist:upload:dry-run must run scripts/upload-release.mjs --dry-run.")
  }
  assert(exists("scripts/upload-release.mjs"), "Missing scripts/upload-release.mjs.")
  assert(hasScript(packageJson, "test:packaged-app-smoke"), "Missing package script: test:packaged-app-smoke")
  if (packageJson?.scripts?.["test:packaged-app-smoke"] !== "node scripts/smoke-packaged-app.mjs") {
    fail("package.json test:packaged-app-smoke must run scripts/smoke-packaged-app.mjs.")
  }
  assert(exists("scripts/smoke-packaged-app.mjs"), "Missing scripts/smoke-packaged-app.mjs.")

  if (!workflow) {
    fail(`Missing ${workflowPath}.`)
    return {
      workflowPath,
      present: false,
      requiredCommands: [],
      requiredSecrets: [],
    }
  }

  const requiredCommands = [
    "bun install --frozen-lockfile",
    "bun run claude:download:all",
    "bun run codex:download:all",
    "bun run release:credentials:strict",
    "bun run test:runtime",
    "bun run ts:check --pretty false",
    "bun run build",
    "bun run release:credentials:strict",
    "bun run package:mac",
    "bun run test:packaged-app-smoke",
    "bun run release:notarize",
    "node scripts/generate-update-manifest.mjs --channel",
    "node scripts/upload-release.mjs --dry-run --channel",
    "bun run release:evidence:audit --require-notarization",
    "node scripts/verify-release-packaging.mjs --require-artifacts --require-bundled-binaries --require-notarization --require-upload-plan",
  ]
  const requiredSecrets = [
    "secrets.APPLE_IDENTITY",
    "secrets.CSC_LINK",
    "secrets.CSC_KEY_PASSWORD",
    "secrets.APPLE_ID",
    "secrets.APPLE_TEAM_ID",
    "secrets.APPLE_APP_SPECIFIC_PASSWORD",
  ]

  for (const command of requiredCommands) {
    if (!workflow.includes(command)) {
      fail(`${workflowPath} is missing required release command: ${command}`)
    }
  }
  for (const secret of requiredSecrets) {
    if (!workflow.includes(secret)) {
      fail(`${workflowPath} is missing required secret contract: ${secret}`)
    }
  }
  if (!workflow.includes("actions/upload-artifact@v4")) {
    fail(`${workflowPath} must upload verified release artifacts.`)
  }
  if (!workflow.includes("release/notarization-*.json")) {
    fail(`${workflowPath} must upload notarization evidence JSON files.`)
  }
  if (!workflow.includes(".1code/program/release-upload/**/manifest.json")) {
    fail(`${workflowPath} must upload release upload plan evidence.`)
  }
  if (!workflow.includes(".1code/program/release-credentials/**/report.json")) {
    fail(`${workflowPath} must upload release credential preflight evidence.`)
  }
  if (!workflow.includes(".1code/program/release-evidence-audit/**/report.json")) {
    fail(`${workflowPath} must upload signed release evidence audit reports.`)
  }
  if (!workflow.includes(".1code/program/packaged-app-smoke/**/report.json")) {
    fail(`${workflowPath} must upload packaged app smoke evidence.`)
  }

  return {
    workflowPath,
    present: true,
    requiredCommands: requiredCommands.map((command) => ({
      command,
      present: workflow.includes(command),
    })),
    requiredSecrets: requiredSecrets.map((secret) => ({
      secret: secret.replace("secrets.", ""),
      present: workflow.includes(secret),
    })),
    uploadsEvidence: includesEvery(workflow, [
      "actions/upload-artifact@v4",
      "release/notarization-*.json",
      "release/codesign-*.txt",
      "release/staple-*.txt",
      "release/spctl-*.txt",
      ".1code/program/packaged-app-smoke/**/report.json",
      ".1code/program/release-credentials/**/report.json",
      ".1code/program/release-evidence-audit/**/report.json",
      ".1code/program/release-upload/**/manifest.json",
    ]),
  }
}

function verifyPackageReleaseScripts(packageJson) {
  const releaseScript = packageJson?.scripts?.release ?? ""
  const releaseLocalScript = packageJson?.scripts?.["release:local"] ?? ""
  const requiredStrictReleaseCommands = [
    "bun install --frozen-lockfile",
    "bun run claude:download:all",
    "bun run codex:download:all",
    "bun run release:credentials",
    "bun run test:runtime",
    "bun run ts:check --pretty false",
    "bun run build",
    "bun run package:mac",
    "bun run test:packaged-app-smoke",
    "bun run release:notarize",
    "bun run dist:manifest",
    "bun run dist:upload:dry-run",
    "bun run release:evidence:audit --require-notarization",
    "node scripts/verify-release-packaging.mjs --require-artifacts --require-bundled-binaries --require-notarization --require-upload-plan",
    "bun run dist:upload",
  ]
  const requiredLocalReleaseCommands = [
    "bun run claude:download:all",
    "bun run codex:download:all",
    "bun run test:runtime",
    "bun run ts:check --pretty false",
    "bun run build",
    "bun run package:mac",
    "bun run test:packaged-app-smoke",
    "bun run dist:manifest",
    "bun run dist:upload:dry-run",
    "bun run release:evidence:audit",
    "node scripts/verify-release-packaging.mjs --require-artifacts --require-bundled-binaries --require-upload-plan",
  ]

  assert(hasScript(packageJson, "release"), "Missing package script: release")
  assert(hasScript(packageJson, "release:ci"), "Missing package script: release:ci")
  assert(hasScript(packageJson, "release:local"), "Missing package script: release:local")
  if (packageJson?.scripts?.["release:ci"] !== "bun run release") {
    fail("package.json release:ci must delegate to the strict release script.")
  }
  if (packageJson?.scripts?.["release:dev"] !== "bun run release:local") {
    fail("package.json release:dev must delegate to release:local.")
  }

  for (const command of requiredStrictReleaseCommands) {
    if (!releaseScript.includes(command)) {
      fail(`package.json release script is missing required command: ${command}`)
    }
  }
  for (const command of requiredLocalReleaseCommands) {
    if (!releaseLocalScript.includes(command)) {
      fail(`package.json release:local script is missing required command: ${command}`)
    }
  }
  if (releaseScript.includes("upload-release-wrangler.sh") || releaseScript.includes("bun i ")) {
    fail("package.json release script must not use the old upload-release-wrangler.sh or non-frozen bun install path.")
  }

  return {
    release: releaseScript,
    releaseCi: packageJson?.scripts?.["release:ci"],
    releaseLocal: releaseLocalScript,
    releaseDev: packageJson?.scripts?.["release:dev"],
    requiredStrictReleaseCommands: requiredStrictReleaseCommands.map((command) => ({
      command,
      present: releaseScript.includes(command),
    })),
    requiredLocalReleaseCommands: requiredLocalReleaseCommands.map((command) => ({
      command,
      present: releaseLocalScript.includes(command),
    })),
  }
}

function verifiedNotarizationReports(releaseFiles) {
  return releaseFiles
    .filter((filePath) => /^notarization-.+\.json$/i.test(path.basename(filePath)))
    .map((filePath) => ({
      filePath,
      report: readJsonPath(filePath),
    }))
    .filter(({ report }) => {
      if (!report) return false
      return report.status === "passed"
        && report.mode?.dryRun === false
        && Number(report.summary?.notarytoolSubmissions ?? 0) > 0
        && Number(report.summary?.stapleCommands ?? 0) > 0
        && Number(report.summary?.codesignVerifications ?? 0) > 0
    })
}

function latestUploadPlan() {
  const latestPath = projectPath(".1code/program/release-upload/latest.json")
  if (!fs.existsSync(latestPath)) return undefined
  const latest = readJson(".1code/program/release-upload/latest.json")
  if (!latest?.manifest) return undefined
  const manifestPath = projectPath(latest.manifest)
  if (!fs.existsSync(manifestPath)) return {
    latest,
    manifestPath,
    manifest: undefined,
  }
  return {
    latest,
    manifestPath,
    manifest: readJsonPath(manifestPath),
  }
}

function latestCredentialPreflight() {
  const latestPath = projectPath(".1code/program/release-credentials/latest.json")
  if (!fs.existsSync(latestPath)) return undefined
  const latest = readJson(".1code/program/release-credentials/latest.json")
  if (!latest?.report) return undefined
  const reportPath = projectPath(latest.report)
  if (!fs.existsSync(reportPath)) return {
    latest,
    reportPath,
    report: undefined,
  }
  return {
    latest,
    reportPath,
    report: readJsonPath(reportPath),
  }
}

function latestReleaseEvidenceAudit() {
  const latestPath = projectPath(".1code/program/release-evidence-audit/latest.json")
  if (!fs.existsSync(latestPath)) return undefined
  const latest = readJson(".1code/program/release-evidence-audit/latest.json")
  if (!latest?.report) return undefined
  const reportPath = projectPath(latest.report)
  if (!fs.existsSync(reportPath)) return {
    latest,
    reportPath,
    report: undefined,
  }
  return {
    latest,
    reportPath,
    report: readJsonPath(reportPath),
  }
}

function packagedAppBinaryState() {
  const apps = [
    {
      arch: "arm64",
      appDir: "release/mac-arm64/1Code.app",
    },
    {
      arch: "x64",
      appDir: "release/mac/1Code.app",
    },
  ]
  const requiredBinaries = ["bin/claude", "bin/codex", "bin/VERSION"]

  return apps.map((app) => {
    const resourceDir = path.join(app.appDir, "Contents", "Resources")
    const binaries = requiredBinaries.map((binary) => {
      const relativePath = path.join(resourceDir, binary).split(path.sep).join("/")
      return {
        name: binary,
        path: relativePath,
        present: exists(relativePath),
      }
    })

    return {
      ...app,
      present: exists(app.appDir),
      binaries,
      complete: binaries.every((binary) => binary.present),
    }
  })
}

function writeReport(report) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const reportDir = projectPath(path.join(".1code/program/release-packaging", timestamp))
  fs.mkdirSync(reportDir, { recursive: true })

  const reportPath = path.join(reportDir, "report.json")
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

  const latestPath = projectPath(".1code/program/release-packaging/latest.json")
  fs.writeFileSync(latestPath, `${JSON.stringify({
    report: normalizeRelative(reportPath),
    generatedAt: report.generatedAt,
    status: report.status,
  }, null, 2)}\n`)

  return reportPath
}

const packageJson = readJson("package.json")
const build = packageJson?.build ?? {}
const mac = build.mac ?? {}
const macTargets = Array.isArray(mac.target) ? mac.target : []
const dmgTarget = targetFor(macTargets, "dmg")
const zipTarget = targetFor(macTargets, "zip")
const asarUnpack = Array.isArray(build.asarUnpack) ? build.asarUnpack : []

assert(hasScript(packageJson, "build"), "Missing package script: build")
assert(hasScript(packageJson, "package:mac"), "Missing package script: package:mac")
assert(hasScript(packageJson, "dist:manifest"), "Missing package script: dist:manifest")
assert(hasScript(packageJson, "verify:program"), "Missing package script: verify:program")
const releaseWorkflow = verifyReleaseWorkflow(packageJson)
const releaseScripts = verifyPackageReleaseScripts(packageJson)

assert(build.asar === true, "Electron build must enable asar packaging.")
assert(asarUnpack.some((entry) => entry.includes("better-sqlite3")), "asarUnpack must include better-sqlite3 native files.")
assert(asarUnpack.some((entry) => entry.includes("node-pty")), "asarUnpack must include node-pty native files.")
assert(asarUnpack.some((entry) => entry.includes("@anthropic-ai/claude-agent-sdk")), "asarUnpack must include Claude Code SDK files.")
assert(asarUnpack.some((entry) => entry.includes("@zed-industries/codex-acp")), "asarUnpack must include Codex ACP files.")

assert(dmgTarget, "mac target must include dmg.")
assert(zipTarget, "mac target must include zip for auto-update.")
assert(dmgTarget && includesAll(dmgTarget.arch ?? [], ["arm64", "x64"]), "mac dmg target must include arm64 and x64.")
assert(zipTarget && includesAll(zipTarget.arch ?? [], ["arm64", "x64"]), "mac zip target must include arm64 and x64.")
assert(mac.hardenedRuntime === true, "mac.hardenedRuntime must be true.")
assert(mac.entitlements === "build/entitlements.mac.plist", "mac.entitlements must point to build/entitlements.mac.plist.")
assert(mac.entitlementsInherit === "build/entitlements.mac.plist", "mac.entitlementsInherit must point to build/entitlements.mac.plist.")
assert(mac.icon === "build/icon.icns", "mac.icon must point to build/icon.icns.")
assert(build.dmg?.contents?.some((entry) => entry?.type === "link" && entry?.path === "/Applications"), "DMG layout must include an Applications link.")
assert(build.publish?.provider === "generic", "publish.provider must be generic for electron-updater CDN manifests.")
assert(typeof build.publish?.url === "string" && build.publish.url.startsWith("https://"), "publish.url must be an HTTPS URL.")

if (!exists("electron-builder.yml")) {
  fail("Missing electron-builder.yml override.")
} else {
  const builderOverride = read("electron-builder.yml")
  assert(builderOverride.includes("identity: ${env.APPLE_IDENTITY}"), "electron-builder.yml must read signing identity from APPLE_IDENTITY.")
  assert(builderOverride.includes("notarize: false"), "electron-builder.yml must keep built-in notarization disabled for explicit CI notarization.")
}

if (!exists("build/entitlements.mac.plist")) {
  fail("Missing build/entitlements.mac.plist.")
} else {
  const entitlements = read("build/entitlements.mac.plist")
  for (const key of [
    "com.apple.security.cs.allow-jit",
    "com.apple.security.cs.allow-unsigned-executable-memory",
    "com.apple.security.cs.disable-library-validation",
    "com.apple.security.network.client",
    "com.apple.security.network.server",
    "com.apple.security.device.audio-input",
  ]) {
    assert(entitlements.includes(key), `Entitlements file is missing ${key}.`)
  }
}

if (!exists("scripts/generate-update-manifest.mjs")) {
  fail("Missing scripts/generate-update-manifest.mjs.")
}

if (!process.env.APPLE_IDENTITY) {
  warn("APPLE_IDENTITY is not set; local package builds will be unsigned or ad-hoc unless electron-builder finds another identity.")
}

const releaseFiles = listReleaseFiles()
const releaseArtifacts = releaseFiles.filter((filePath) => /\.(dmg|zip)$/i.test(filePath))
const updateManifests = releaseFiles.filter((filePath) => /(?:latest|beta)-mac(?:-x64)?\.yml$/.test(path.basename(filePath)))
const notarizationEvidence = releaseFiles.filter((filePath) => /notary|notar|codesign|staple|spctl/i.test(path.basename(filePath)))
const validNotarizationReports = verifiedNotarizationReports(releaseFiles)
const packagedAppBinaries = packagedAppBinaryState()
const uploadPlan = latestUploadPlan()
const credentialPreflight = latestCredentialPreflight()
const releaseEvidenceAudit = latestReleaseEvidenceAudit()

if (releaseArtifacts.length === 0) {
  const message = "No macOS release artifacts were found in release/."
  if (requireArtifacts) fail(message)
  else warn(`${message} Run bun run package:mac to produce DMG/ZIP evidence.`)
}

if (requireArtifacts && updateManifests.length === 0) {
  fail("No macOS update manifests were found in release/. Run bun run dist:manifest after packaging.")
}

const missingBundledBinaries = packagedAppBinaries.flatMap((app) =>
  app.binaries
    .filter((binary) => !binary.present)
    .map((binary) => `${app.arch}:${binary.name}`),
)
if (missingBundledBinaries.length > 0) {
  const message = `Packaged app is missing bundled runtime binaries: ${missingBundledBinaries.join(", ")}.`
  if (requireBundledBinaries) fail(message)
  else warn(message)
}

if (requireNotarization && validNotarizationReports.length === 0) {
  fail("No passing notarization report was found in release/. Run bun run release:notarize in CI with Apple signing credentials.")
}

if (uploadPlan?.manifest?.status && uploadPlan.manifest.status !== "passed") {
  fail(`Release upload plan ${normalizeRelative(uploadPlan.manifestPath)} has status ${uploadPlan.manifest.status}, expected passed.`)
}
if (requireUploadPlan) {
  if (!uploadPlan?.manifest) {
    fail("No release upload plan was found. Run bun run dist:upload:dry-run after generating update manifests.")
  } else if (uploadPlan.manifest.mode?.dryRun !== true) {
    fail(`Release upload plan ${normalizeRelative(uploadPlan.manifestPath)} must be a dry-run pre-upload plan.`)
  } else if (!Array.isArray(uploadPlan.manifest.artifacts) || uploadPlan.manifest.artifacts.length < 6) {
    fail(`Release upload plan ${normalizeRelative(uploadPlan.manifestPath)} does not include all required macOS artifacts and manifests.`)
  }
}

if (credentialPreflight?.report?.status === "failed") {
  fail(`Release credential preflight ${normalizeRelative(credentialPreflight.reportPath)} failed.`)
}
if (requireNotarization) {
  if (!credentialPreflight?.report) {
    fail("No release credential preflight report was found. Run bun run release:credentials:strict before packaging.")
  } else if (credentialPreflight.report.status !== "passed") {
    fail(`Release credential preflight ${normalizeRelative(credentialPreflight.reportPath)} status is ${credentialPreflight.report.status}, expected passed for notarized release verification.`)
  }
}

if (releaseEvidenceAudit?.report?.status === "failed") {
  fail(`Release evidence audit ${normalizeRelative(releaseEvidenceAudit.reportPath)} failed.`)
}
if (requireNotarization) {
  if (!releaseEvidenceAudit?.report) {
    fail("No release evidence audit report was found. Run bun run release:evidence:audit --require-notarization after notarization and upload-plan generation.")
  } else if (releaseEvidenceAudit.report.status !== "passed") {
    fail(`Release evidence audit ${normalizeRelative(releaseEvidenceAudit.reportPath)} status is ${releaseEvidenceAudit.report.status}, expected passed for notarized release verification.`)
  } else if (releaseEvidenceAudit.report.distribution?.distributable !== true) {
    fail(`Release evidence audit ${normalizeRelative(releaseEvidenceAudit.reportPath)} did not mark the artifacts distributable.`)
  }
} else if (!releaseEvidenceAudit?.report) {
  warn("No release evidence audit report was found. Run bun run release:evidence:audit to record the current signed/notarized distribution state.")
}

const report = {
  status: failures.length === 0 ? "passed" : "failed",
  generatedAt: new Date().toISOString(),
  mode: {
    requireArtifacts,
    requireBundledBinaries,
    requireNotarization,
    requireUploadPlan,
  },
  scripts: {
    build: packageJson?.scripts?.build,
    packageMac: packageJson?.scripts?.["package:mac"],
    distManifest: packageJson?.scripts?.["dist:manifest"],
    distUpload: packageJson?.scripts?.["dist:upload"],
    distUploadDryRun: packageJson?.scripts?.["dist:upload:dry-run"],
    packagedAppSmoke: packageJson?.scripts?.["test:packaged-app-smoke"],
    releaseCredentials: packageJson?.scripts?.["release:credentials"],
    releaseCredentialsStrict: packageJson?.scripts?.["release:credentials:strict"],
    releaseNotarize: packageJson?.scripts?.["release:notarize"],
    releaseEvidenceAudit: packageJson?.scripts?.["release:evidence:audit"],
    release: releaseScripts.release,
    releaseCi: releaseScripts.releaseCi,
    releaseLocal: releaseScripts.releaseLocal,
    releaseDev: releaseScripts.releaseDev,
    releaseScriptChecks: {
      requiredStrictReleaseCommands: releaseScripts.requiredStrictReleaseCommands,
      requiredLocalReleaseCommands: releaseScripts.requiredLocalReleaseCommands,
    },
  },
  mac: {
    targets: macTargets,
    hardenedRuntime: mac.hardenedRuntime === true,
    entitlements: mac.entitlements,
    entitlementsInherit: mac.entitlementsInherit,
    icon: mac.icon,
    publish: build.publish,
  },
  signing: {
    appleIdentityEnv: process.env.APPLE_IDENTITY ? "set" : "missing",
    electronBuilderIdentity: exists("electron-builder.yml") ? "env.APPLE_IDENTITY" : "missing",
    notarizationMode: "external-ci",
    electronBuilderNotarize: false,
    releaseWorkflow,
    credentialPreflight: credentialPreflight?.report
      ? {
        report: normalizeRelative(credentialPreflight.reportPath),
        status: credentialPreflight.report.status,
        requireCredentials: credentialPreflight.report.mode?.requireCredentials === true,
        credentialsComplete: credentialPreflight.report.credentials?.complete === true,
        missingCredentials: Array.isArray(credentialPreflight.report.credentials?.missing)
          ? credentialPreflight.report.credentials.missing
          : [],
        toolsComplete: credentialPreflight.report.tools?.complete === true,
        missingTools: Array.isArray(credentialPreflight.report.tools?.missing)
          ? credentialPreflight.report.tools.missing
          : [],
        workflowCredentialPreflightStep: credentialPreflight.report.workflow?.credentialPreflightStep === true,
        blockers: Array.isArray(credentialPreflight.report.blockers)
          ? credentialPreflight.report.blockers
          : [],
      }
      : null,
    evidenceAudit: releaseEvidenceAudit?.report
      ? {
        report: normalizeRelative(releaseEvidenceAudit.reportPath),
        status: releaseEvidenceAudit.report.status,
        requireNotarization: releaseEvidenceAudit.report.mode?.requireNotarization === true,
        distributable: releaseEvidenceAudit.report.distribution?.distributable === true,
        blockerCount: Number(releaseEvidenceAudit.report.distribution?.blockerCount ?? 0),
        validNotarizationReports: Array.isArray(releaseEvidenceAudit.report.notarization?.validReports)
          ? releaseEvidenceAudit.report.notarization.validReports
          : [],
        acceptedSubmissions: Number(releaseEvidenceAudit.report.notarization?.acceptedSubmissions ?? 0),
      }
      : null,
    validNotarizationReports: validNotarizationReports.map(({ filePath }) => normalizeRelative(filePath)),
  },
  artifacts: {
    releaseDir: "release",
    files: releaseFiles.map(normalizeRelative),
    macArtifacts: releaseArtifacts.map(normalizeRelative),
    updateManifests: updateManifests.map(normalizeRelative),
    notarizationEvidence: notarizationEvidence.map(normalizeRelative),
    packagedAppBinaries,
  },
  distribution: {
    uploadScript: exists("scripts/upload-release.mjs") ? "scripts/upload-release.mjs" : "missing",
    uploadPlan: uploadPlan?.manifest
      ? {
        manifest: normalizeRelative(uploadPlan.manifestPath),
        status: uploadPlan.manifest.status,
        dryRun: uploadPlan.manifest.mode?.dryRun === true,
        provider: uploadPlan.manifest.mode?.provider,
        channel: uploadPlan.manifest.mode?.channel,
        target: uploadPlan.manifest.target,
        artifactCount: Array.isArray(uploadPlan.manifest.artifacts)
          ? uploadPlan.manifest.artifacts.length
          : 0,
      }
      : null,
  },
  warnings,
  failures,
}

const reportPath = writeReport(report)

console.log("Moss release packaging verification")
console.log(`status: ${report.status}`)
console.log(`report: ${normalizeRelative(reportPath)}`)
console.log(`mac artifacts: ${releaseArtifacts.length}`)
console.log(`update manifests: ${updateManifests.length}`)
console.log(`notarization evidence: ${notarizationEvidence.length}`)
console.log(`bundled binaries: ${packagedAppBinaries.map((app) => `${app.arch}=${app.complete ? "complete" : "incomplete"}`).join(", ")}`)
console.log(`upload plan: ${uploadPlan?.manifest ? normalizeRelative(uploadPlan.manifestPath) : "missing"}`)
console.log(`credential preflight: ${credentialPreflight?.report ? `${credentialPreflight.report.status} (${normalizeRelative(credentialPreflight.reportPath)})` : "missing"}`)
console.log(`release evidence audit: ${releaseEvidenceAudit?.report ? `${releaseEvidenceAudit.report.status} (${normalizeRelative(releaseEvidenceAudit.reportPath)})` : "missing"}`)

for (const message of warnings) {
  console.warn(`warning: ${message}`)
}

if (failures.length > 0) {
  for (const message of failures) {
    console.error(`error: ${message}`)
  }
  process.exit(1)
}
