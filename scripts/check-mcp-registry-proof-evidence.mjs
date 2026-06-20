#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const changeId = "add-mcp-registry-install"
const allowedStatuses = new Set(["pending", "passed", "failed", "blocked"])
const scenarioTaskMap = new Map([
  ["claude-agent-sdk-mcp-observability", ["1.1"]],
  ["codex-app-server-mcp-observability", ["1.2"]],
  ["verified-state-policy", ["1.3"]],
  ["claude-verified-upgrade", ["4.3"]],
  ["codex-verified-upgrade", ["4.4"]],
  ["claude-registry-real-run", ["5.6"]],
])
const requiredRunbookMarkers = [
  "Provider call authorization: required",
  "HOME=/private/tmp/locus-mcp-registry-home",
  "CODEX_HOME=/private/tmp/locus-mcp-registry-home/.codex",
  "LOCUS_USER_DATA_DIR=/private/tmp/locus-mcp-registry-smoke",
  "Do not paste raw OAuth tokens",
  "Do not offer or record `Verified on Codex` if any of those signals are missing.",
  "not the token strings.",
  "bun run mcp-registry:proof:evidence",
]
const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /(access[_-]?token|refresh[_-]?token|auth[_-]?token|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
]

function fail(message) {
  console.error(`[mcp-registry-proof] ${message}`)
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

  fail(`could not find active OpenSpec change ${changeId}.`)
  process.exit()
}

function taskIsChecked(tasks, taskId) {
  const escaped = taskId.replace(".", "\\.")
  return new RegExp(`^- \\[x\\] ${escaped}\\b`, "m").test(tasks)
}

function assertNoSecretLikeValues(path, content) {
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      fail(`${path} appears to contain an unredacted secret-like value.`)
      break
    }
  }
}

const changeDir = findChangeDir()
const evidencePath = join(changeDir, "runtime-proof-evidence.md")
const runbookPath = join(changeDir, "runtime-proof-runbook.md")
const tasksPath = join(changeDir, "tasks.md")
const evidence = read(evidencePath)
const runbook = read(runbookPath)
const tasks = read(tasksPath)

if (!evidence.includes("Provider call authorization: required")) {
  fail(`${evidencePath} must state provider call authorization is required.`)
}

for (const marker of requiredRunbookMarkers) {
  if (!runbook.includes(marker)) {
    fail(`${runbookPath} is missing required marker: ${marker}`)
  }
}

assertNoSecretLikeValues(evidencePath, evidence)
assertNoSecretLikeValues(runbookPath, runbook)

const statusByScenario = new Map()
const scenarioPattern = /^## Scenario: ([a-z0-9-]+)\n\nStatus: ([a-z]+)$/gm
let match = scenarioPattern.exec(evidence)
while (match !== null) {
  const [, scenarioId, status] = match
  statusByScenario.set(scenarioId, status)
  match = scenarioPattern.exec(evidence)
}

for (const [scenarioId, taskIds] of scenarioTaskMap.entries()) {
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

  for (const taskId of taskIds) {
    const checked = taskIsChecked(tasks, taskId)
    if (checked && status !== "passed") {
      fail(
        `task ${taskId} is checked but scenario ${scenarioId} is ${status}, not passed.`,
      )
    }
    if (!checked && status === "passed") {
      fail(
        `scenario ${scenarioId} passed but task ${taskId} is still unchecked.`,
      )
    }
  }
}

if (process.exitCode) {
  process.exit()
}

console.log("[mcp-registry-proof] evidence status:")
for (const scenarioId of scenarioTaskMap.keys()) {
  console.log(`- ${scenarioId}: ${statusByScenario.get(scenarioId)}`)
}
