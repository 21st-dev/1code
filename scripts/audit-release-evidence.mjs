#!/usr/bin/env node

import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const requireNotarization = process.argv.includes("--require-notarization")
const generatedAt = new Date().toISOString()
const stamp = generatedAt.replace(/[:.]/g, "-")
const reportDir = path.join(root, ".1code/program/release-evidence-audit", stamp)
const reportPath = path.join(reportDir, "report.json")
const latestPath = path.join(root, ".1code/program/release-evidence-audit/latest.json")
const failures = []
const warnings = []
const blockers = []

function projectPath(relativePath) {
  return path.join(root, relativePath)
}

function normalizeRelative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/")
}

function exists(relativePath) {
  return fs.existsSync(projectPath(relativePath))
}

function listReleaseFiles() {
  const releaseDir = projectPath("release")
  if (!fs.existsSync(releaseDir)) return []
  return fs.readdirSync(releaseDir)
    .map((name) => path.join(releaseDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort()
}

function releaseAppDirs() {
  return [
    {
      arch: "arm64",
      path: "release/mac-arm64/1Code.app",
    },
    {
      arch: "x64",
      path: "release/mac/1Code.app",
    },
  ].map((app) => ({
    ...app,
    present: exists(app.path),
  }))
}

function readJsonPath(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    failures.push(`Could not parse ${normalizeRelative(filePath)}: ${error.message}`)
    return undefined
  }
}

function readTextRelative(relativePath) {
  const filePath = projectPath(relativePath)
  if (!fs.existsSync(filePath)) return undefined
  return fs.readFileSync(filePath, "utf8")
}

function parseNotaryStatus(stdoutPath) {
  const raw = readTextRelative(stdoutPath)
  if (!raw) return {
    path: stdoutPath,
    parseable: false,
    status: "missing",
  }

  try {
    const parsed = JSON.parse(raw)
    return {
      path: stdoutPath,
      parseable: true,
      id: parsed.id ?? null,
      status: parsed.status ?? "unknown",
      accepted: parsed.status === "Accepted",
    }
  } catch {
    return {
      path: stdoutPath,
      parseable: false,
      status: "unparseable",
    }
  }
}

function commandOutputReferences(command) {
  return [command.stdout, command.stderr]
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((value) => ({
      path: value,
      present: exists(value),
    }))
}

function inspectNotarizationReport(filePath) {
  const report = readJsonPath(filePath)
  const commands = Array.isArray(report?.commands) ? report.commands : []
  const commandFailures = commands.filter((command) => command.exitCode !== 0)
  const references = commands.flatMap(commandOutputReferences)
  const missingReferences = references.filter((reference) => !reference.present)
  const notaryCommands = commands.filter((command) => String(command.label ?? "").startsWith("notarytool submit"))
  const notaryStatuses = notaryCommands
    .map((command) => command.stdout)
    .filter((stdoutPath) => typeof stdoutPath === "string" && stdoutPath.length > 0)
    .map(parseNotaryStatus)
  const unacceptedStatuses = notaryStatuses.filter((status) => status.accepted !== true)
  const summary = report?.summary ?? {}
  const dryRun = report?.mode?.dryRun === true
  const valid = Boolean(report)
    && report.status === "passed"
    && dryRun === false
    && commands.length > 0
    && commandFailures.length === 0
    && missingReferences.length === 0
    && Number(summary.notarytoolSubmissions ?? 0) > 0
    && Number(summary.stapleCommands ?? 0) > 0
    && Number(summary.codesignVerifications ?? 0) > 0
    && Number(summary.spctlAssessments ?? 0) > 0
    && notaryStatuses.length > 0
    && unacceptedStatuses.length === 0

  return {
    path: normalizeRelative(filePath),
    status: report?.status ?? "missing",
    dryRun,
    commandCount: commands.length,
    commandFailures: commandFailures.map((command) => ({
      label: command.label ?? command.command ?? "unknown",
      exitCode: command.exitCode ?? null,
    })),
    missingReferences,
    summary: {
      notarytoolSubmissions: Number(summary.notarytoolSubmissions ?? 0),
      stapleCommands: Number(summary.stapleCommands ?? 0),
      codesignVerifications: Number(summary.codesignVerifications ?? 0),
      spctlAssessments: Number(summary.spctlAssessments ?? 0),
    },
    notaryStatuses,
    valid,
  }
}

const releaseFiles = listReleaseFiles()
const macArtifacts = releaseFiles
  .filter((filePath) => /\.(dmg|zip)$/i.test(filePath))
  .map(normalizeRelative)
const updateManifests = releaseFiles
  .filter((filePath) => /(?:latest|beta)-mac(?:-x64)?\.yml$/.test(path.basename(filePath)))
  .map(normalizeRelative)
const notarizationReportFiles = releaseFiles
  .filter((filePath) => /^notarization-.+\.json$/i.test(path.basename(filePath)))
const notarizationReports = notarizationReportFiles.map(inspectNotarizationReport)
const validNotarizationReports = notarizationReports.filter((report) => report.valid)
const apps = releaseAppDirs()
const presentApps = apps.filter((app) => app.present)
const notarizationEvidenceFiles = releaseFiles
  .filter((filePath) => /notary|notar|codesign|staple|spctl/i.test(path.basename(filePath)))
  .map(normalizeRelative)

if (macArtifacts.length < 4) {
  blockers.push(`Expected at least 4 macOS DMG/ZIP artifacts, found ${macArtifacts.length}.`)
}
if (updateManifests.length < 2) {
  blockers.push(`Expected at least 2 macOS update manifests, found ${updateManifests.length}.`)
}
if (presentApps.length < 2) {
  blockers.push(`Expected both packaged app directories, found ${presentApps.length}.`)
}
if (validNotarizationReports.length === 0) {
  blockers.push("No valid signed/notarized release evidence report was found.")
}

for (const report of notarizationReports) {
  if (!report.valid) {
    warnings.push(`Notarization report ${report.path} is not valid distributable evidence.`)
  }
}

if (requireNotarization && blockers.length > 0) {
  failures.push(...blockers)
}

const status = failures.length > 0
  ? "failed"
  : blockers.length > 0
    ? "blocked"
    : "passed"

const report = {
  status,
  generatedAt,
  mode: {
    requireNotarization,
  },
  releaseDir: "release",
  artifacts: {
    macArtifacts,
    updateManifests,
    notarizationEvidenceFiles,
    apps,
  },
  notarization: {
    reports: notarizationReports,
    validReports: validNotarizationReports.map((entry) => entry.path),
    acceptedSubmissions: notarizationReports.reduce(
      (count, entry) => count + entry.notaryStatuses.filter((status) => status.accepted === true).length,
      0,
    ),
    validReportCount: validNotarizationReports.length,
  },
  distribution: {
    distributable: status === "passed",
    blockerCount: blockers.length,
    blockers,
  },
  warnings,
  failures,
}

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
fs.writeFileSync(latestPath, `${JSON.stringify({
  report: normalizeRelative(reportPath),
  generatedAt,
  status,
}, null, 2)}\n`)

console.log("Moss release evidence audit")
console.log(`status: ${status}`)
console.log(`report: ${normalizeRelative(reportPath)}`)
console.log(`mac artifacts: ${macArtifacts.length}`)
console.log(`update manifests: ${updateManifests.length}`)
console.log(`notarization reports: ${notarizationReports.length}`)
console.log(`valid notarization reports: ${validNotarizationReports.length}`)

for (const message of warnings) {
  console.warn(`warning: ${message}`)
}
for (const message of blockers) {
  console.warn(`blocker: ${message}`)
}
for (const message of failures) {
  console.error(`error: ${message}`)
}

if (failures.length > 0) {
  process.exit(1)
}
