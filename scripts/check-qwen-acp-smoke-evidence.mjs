#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const changeId = "add-qwen-acp-spike"
const allowedStatuses = new Set(["pending", "passed", "failed", "blocked"])
const scenarioTaskMap = new Map([
  [
    "qwen-cli-acp-initialize",
    { taskIds: ["0.2"], checkedStatuses: ["passed"] },
  ],
  ["qwen-auth-session", { taskIds: ["0.4"], checkedStatuses: ["passed"] }],
  ["qwen-launch-stream", { taskIds: ["9.1"], checkedStatuses: ["passed"] }],
  ["qwen-file-edit", { taskIds: ["9.2"], checkedStatuses: ["passed"] }],
  [
    "qwen-permission-request",
    { taskIds: ["9.3"], checkedStatuses: ["passed"] },
  ],
  ["qwen-cancel", { taskIds: ["9.4"], checkedStatuses: ["passed"] }],
  ["qwen-error-mapping", { taskIds: ["9.5"], checkedStatuses: ["passed"] }],
])
const requiredRunbookMarkers = [
  "Provider call authorization: required",
  "LOCUS_ENABLE_QWEN_CODE_RUNTIME=1",
  "LOCUS_QWEN_CODE_AUTH_TYPE=openai",
  "LOCUS_USER_DATA_DIR",
  'OPENAI_API_KEY="$YOUR_QWEN_SMOKE_OPENAI_KEY"',
  "Do not paste raw API keys",
  "do not check task 0.4",
  "Only check a task in `tasks.md` when the matching evidence scenario is `passed`.",
  "bun run qwen-acp:smoke:evidence",
]
const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/,
  /\bsk-[A-Za-z0-9_-]{16,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /(api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|cookie)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{8,}/i,
]

function fail(message) {
  console.error(`[qwen-acp-smoke] ${message}`)
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
const evidencePath = join(changeDir, "qwen-acp-smoke-evidence.md")
const runbookPath = join(changeDir, "qwen-acp-smoke-runbook.md")
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

for (const [
  scenarioId,
  { taskIds, checkedStatuses },
] of scenarioTaskMap.entries()) {
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
    const statusAllowsCheckedTask = checkedStatuses.includes(status)
    if (checked && !statusAllowsCheckedTask) {
      fail(
        `task ${taskId} is checked but scenario ${scenarioId} is ${status}, not one of ${checkedStatuses.join(", ")}.`,
      )
    }
    if (!checked && statusAllowsCheckedTask) {
      fail(
        `scenario ${scenarioId} is ${status} but task ${taskId} is still unchecked.`,
      )
    }
  }
}

if (process.exitCode) {
  process.exit()
}

console.log("[qwen-acp-smoke] evidence status:")
for (const scenarioId of scenarioTaskMap.keys()) {
  console.log(`- ${scenarioId}: ${statusByScenario.get(scenarioId)}`)
}
