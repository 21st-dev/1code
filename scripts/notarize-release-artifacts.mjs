#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const root = process.cwd()
const dryRun = process.argv.includes("--dry-run")
const releaseDir = path.join(root, "release")
const generatedAt = new Date().toISOString()
const stamp = generatedAt.replace(/[:.]/g, "-")
const reportDir = dryRun
  ? path.join(root, ".1code/program/release-packaging")
  : releaseDir
const reportPath = path.join(reportDir, dryRun ? `notarization-dry-run-${stamp}.json` : `notarization-${stamp}.json`)
const failures = []
const warnings = []
const commands = []

function exists(filePath) {
  return fs.existsSync(filePath)
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join("/")
}

function releaseFilesMatching(pattern) {
  if (!exists(releaseDir)) return []
  return fs.readdirSync(releaseDir)
    .map((name) => path.join(releaseDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .filter((filePath) => pattern.test(path.basename(filePath)))
    .sort()
}

function releaseAppDirs() {
  return [
    path.join(releaseDir, "mac-arm64/1Code.app"),
    path.join(releaseDir, "mac/1Code.app"),
  ].filter(exists)
}

function redactArg(arg) {
  if (arg === process.env.APPLE_ID) return "<APPLE_ID>"
  if (arg === process.env.APPLE_TEAM_ID) return "<APPLE_TEAM_ID>"
  if (arg === process.env.APPLE_APP_SPECIFIC_PASSWORD) return "<APPLE_APP_SPECIFIC_PASSWORD>"
  return arg
}

function credentialState(name) {
  return process.env[name] ? "set" : "missing"
}

function runCommand(label, command, args, outputBaseName) {
  const redactedArgs = args.map(redactArg)
  const record = {
    label,
    command,
    args: redactedArgs,
    dryRun,
    exitCode: dryRun ? 0 : undefined,
    stdout: undefined,
    stderr: undefined,
  }

  if (dryRun) {
    commands.push(record)
    return
  }

  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  })

  const stdoutPath = path.join(releaseDir, `${outputBaseName}.stdout.txt`)
  const stderrPath = path.join(releaseDir, `${outputBaseName}.stderr.txt`)
  fs.writeFileSync(stdoutPath, result.stdout ?? "")
  fs.writeFileSync(stderrPath, result.stderr ?? "")

  record.exitCode = result.status ?? 1
  record.stdout = relative(stdoutPath)
  record.stderr = relative(stderrPath)
  commands.push(record)

  if (record.exitCode !== 0) {
    failures.push(`${label} failed with exit code ${record.exitCode}.`)
  }
}

const credentials = {
  appleId: credentialState("APPLE_ID"),
  appleTeamId: credentialState("APPLE_TEAM_ID"),
  appSpecificPassword: credentialState("APPLE_APP_SPECIFIC_PASSWORD"),
  appleIdentity: credentialState("APPLE_IDENTITY"),
  cscLink: credentialState("CSC_LINK"),
  cscKeyPassword: credentialState("CSC_KEY_PASSWORD"),
}

for (const [name, state] of Object.entries(credentials)) {
  if (state !== "set") failures.push(`Missing required signing/notarization credential: ${name}.`)
}

const artifacts = releaseFilesMatching(/\.(dmg|zip)$/i)
const dmgArtifacts = artifacts.filter((filePath) => /\.dmg$/i.test(filePath))
const apps = releaseAppDirs()

if (artifacts.length === 0) {
  failures.push("No DMG or ZIP release artifacts found in release/. Run bun run package:mac first.")
}
if (apps.length === 0) {
  failures.push("No packaged .app directories found in release/mac*/. Run bun run package:mac first.")
}

if (dryRun && failures.length > 0) {
  warnings.push(...failures)
  failures.length = 0
}

if (failures.length === 0) {
  for (const artifact of artifacts) {
    runCommand(
      `notarytool submit ${relative(artifact)}`,
      "xcrun",
      [
        "notarytool",
        "submit",
        artifact,
        "--apple-id",
        process.env.APPLE_ID,
        "--team-id",
        process.env.APPLE_TEAM_ID,
        "--password",
        process.env.APPLE_APP_SPECIFIC_PASSWORD,
        "--wait",
        "--output-format",
        "json",
      ],
      `notarytool-${stamp}-${path.basename(artifact).replace(/[^A-Za-z0-9_.-]/g, "_")}`,
    )
  }

  for (const target of [...apps, ...dmgArtifacts]) {
    runCommand(
      `stapler staple ${relative(target)}`,
      "xcrun",
      ["stapler", "staple", target],
      `staple-${stamp}-${path.basename(target).replace(/[^A-Za-z0-9_.-]/g, "_")}`,
    )
  }

  for (const app of apps) {
    runCommand(
      `codesign verify ${relative(app)}`,
      "codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", app],
      `codesign-${stamp}-${path.basename(path.dirname(app)).replace(/[^A-Za-z0-9_.-]/g, "_")}`,
    )
    runCommand(
      `spctl assess ${relative(app)}`,
      "spctl",
      ["--assess", "--type", "execute", "--verbose=4", app],
      `spctl-${stamp}-${path.basename(path.dirname(app)).replace(/[^A-Za-z0-9_.-]/g, "_")}`,
    )
  }
}

const report = {
  status: failures.length === 0 ? "passed" : "failed",
  generatedAt,
  mode: { dryRun },
  credentials,
  artifacts: artifacts.map(relative),
  apps: apps.map(relative),
  commands,
  summary: {
    notarytoolSubmissions: commands.filter((command) => command.label.startsWith("notarytool submit")).length,
    stapleCommands: commands.filter((command) => command.label.startsWith("stapler staple")).length,
    codesignVerifications: commands.filter((command) => command.label.startsWith("codesign verify")).length,
    spctlAssessments: commands.filter((command) => command.label.startsWith("spctl assess")).length,
  },
  warnings,
  failures,
}

fs.mkdirSync(reportDir, { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)

console.log("Moss notarization evidence")
console.log(`status: ${report.status}`)
console.log(`report: ${relative(reportPath)}`)
console.log(`artifacts: ${artifacts.length}`)
console.log(`apps: ${apps.length}`)
console.log(`commands: ${commands.length}`)

for (const message of warnings) {
  console.warn(`warning: ${message}`)
}
for (const message of failures) {
  console.error(`error: ${message}`)
}

if (failures.length > 0) {
  process.exit(1)
}
