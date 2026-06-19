#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const changeId = "refactor-settings-ia"
const requiredScenarios = [
  "moved-controls-and-preserved-values",
  "notifications-group",
  "code-theme-pickers",
  "about-version-debug-unlock",
]
const allowedStatuses = new Set(["pending", "passed", "failed", "blocked"])

function fail(message) {
  console.error(`[settings-ia-smoke] ${message}`)
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
const evidencePath = join(changeDir, "manual-smoke-evidence.md")
const tasksPath = join(changeDir, "tasks.md")
const evidence = read(evidencePath)
const tasks = read(tasksPath)
const task56Checked =
  /- \[x\] 5\.6 Manual smoke: each moved toggle is in its new tab/.test(tasks)
const statusByScenario = new Map()
const scenarioPattern = /^## Scenario: ([a-z0-9-]+)\n\nStatus: ([a-z]+)$/gm

let match = scenarioPattern.exec(evidence)
while (match !== null) {
  const [, scenarioId, status] = match
  statusByScenario.set(scenarioId, status)
  match = scenarioPattern.exec(evidence)
}

if (!evidence.includes("Provider call authorization: not required")) {
  fail(
    `${evidencePath} must state provider call authorization is not required.`,
  )
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

if (task56Checked && notPassed.length > 0) {
  fail(
    `task 5.6 is checked but manual smoke evidence is not passed for: ${notPassed.join(", ")}.`,
  )
}

if (!task56Checked && notPassed.length === 0) {
  fail("all manual smoke evidence passed, but task 5.6 is still unchecked.")
}

if (process.exitCode) {
  process.exit()
}

console.log("[settings-ia-smoke] evidence status:")
for (const scenarioId of requiredScenarios) {
  console.log(`- ${scenarioId}: ${statusByScenario.get(scenarioId)}`)
}
console.log(
  `[settings-ia-smoke] task 5.6: ${task56Checked ? "checked" : "unchecked"}`,
)
