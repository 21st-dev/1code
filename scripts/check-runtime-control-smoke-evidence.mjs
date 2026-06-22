#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const changeId = "add-runtime-control-layer"
const historicalCodexScenarioPrefix = [
  "codex",
  "temporary",
  "compat",
].join("-")
const requiredScenarios = [
  "claude-plan",
  "claude-guard",
  `${historicalCodexScenarioPrefix}-plan`,
  `${historicalCodexScenarioPrefix}-guard`,
]
const allowedStatuses = new Set(["pending", "passed", "failed", "blocked"])

function fail(message) {
  console.error(`[runtime-control-smoke] ${message}`)
  process.exitCode = 1
}

function read(path) {
  return readFileSync(path, "utf8")
}

function findChangeDir() {
  const activeDir = join("openspec", "changes", changeId)
  if (existsSync(activeDir)) return activeDir

  const archiveRoot = join("openspec", "changes", "archive")
  const archivedDirs = existsSync(archiveRoot)
    ? readdirSync(archiveRoot)
        .filter((name) => name.endsWith(`-${changeId}`))
        .sort()
    : []
  const latestArchive = archivedDirs.at(-1)
  if (latestArchive) return join(archiveRoot, latestArchive)

  fail(`could not find active or archived OpenSpec change ${changeId}.`)
  process.exit()
}

const changeDir = findChangeDir()
const evidencePath = join(changeDir, "smoke-evidence.md")
const tasksPath = join(changeDir, "tasks.md")
const evidence = read(evidencePath)
const tasks = read(tasksPath)
const task66Checked = /- \[x\] 6\.6 Record desktop smoke evidence/.test(tasks)
const statusByScenario = new Map()
const scenarioPattern =
  /^## Scenario: ([a-z0-9-]+)\n\nStatus: ([a-z]+)$/gm

let match
while ((match = scenarioPattern.exec(evidence)) !== null) {
  const [, scenarioId, status] = match
  statusByScenario.set(scenarioId, status)
}

if (!evidence.includes("Provider call authorization: required")) {
  fail(`${evidencePath} must state provider call authorization is required.`)
}

for (const scenarioId of requiredScenarios) {
  const status = statusByScenario.get(scenarioId)
  if (!status) {
    fail(`${evidencePath} is missing scenario ${scenarioId}.`)
    continue
  }
  if (!allowedStatuses.has(status)) {
    fail(
      `${evidencePath} scenario ${scenarioId} has unsupported status ${status}.`,
    )
  }
}

const notPassed = requiredScenarios.filter(
  (scenarioId) => statusByScenario.get(scenarioId) !== "passed",
)

if (task66Checked && notPassed.length > 0) {
  fail(
    `task 6.6 is checked but smoke evidence is not passed for: ${notPassed.join(", ")}.`,
  )
}

if (!task66Checked && notPassed.length === 0) {
  fail("all smoke evidence passed, but task 6.6 is still unchecked.")
}

if (process.exitCode) {
  process.exit()
}

console.log("[runtime-control-smoke] evidence status:")
for (const scenarioId of requiredScenarios) {
  console.log(`- ${scenarioId}: ${statusByScenario.get(scenarioId)}`)
}
console.log(
  `[runtime-control-smoke] task 6.6: ${task66Checked ? "checked" : "unchecked"}`,
)
