#!/usr/bin/env node

import { existsSync } from "node:fs"
import Database from "better-sqlite3"

const SCENARIOS = {
  "claude-plan": {
    runtime: "claude-code",
    mode: "plan",
    adapterSource: "claude-agent-sdk",
    requiresGuardEvent: false,
  },
  "claude-guard": {
    runtime: "claude-code",
    mode: "agent",
    adapterSource: "claude-agent-sdk",
    requiresGuardEvent: true,
  },
  "codex-temporary-compat-plan": {
    runtime: "codex",
    mode: "plan",
    adapterSource: "codex-acp-temporary-compat",
    requiresGuardEvent: false,
  },
  "codex-temporary-compat-guard": {
    runtime: "codex",
    mode: "agent",
    adapterSource: "codex-acp-temporary-compat",
    requiresGuardEvent: true,
  },
}

const TERMINAL_JOB_STATUSES = new Set([
  "succeeded",
  "failed",
  "canceled",
  "interrupted",
])
const TERMINAL_EVENT_TYPES = new Set(["completed", "error"])
const GUARD_EVENT_TYPES = new Set([
  "guard_decision",
  "permission_requested",
  "scope_expansion_requested",
])
const SECRET_KEY_PATTERN =
  /(api[_-]?key|access[_-]?token|auth[_-]?token|authorization|bearer|secret|refresh[_-]?token|oauth[_-]?token|cookie|set-cookie|x-api-key)/i
const SECRET_VALUE_PATTERN =
  /(Bearer\s+[A-Za-z0-9._~+/=-]+|sk-[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{10,})/

function parseArgs(argv) {
  const result = {}
  for (const arg of argv) {
    const match = /^--([^=]+)=(.*)$/.exec(arg)
    if (match) {
      result[match[1]] = match[2]
    }
  }
  return result
}

function fail(failures, message) {
  failures.push(message)
}

function readJson(value, fallback = {}) {
  if (typeof value !== "string" || !value.trim()) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function scanForSecrets(value, path = "$", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanForSecrets(item, `${path}[${index}]`, findings)
    })
    return findings
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`
      if (SECRET_KEY_PATTERN.test(key)) {
        findings.push(`${childPath} has secret-like key`)
      }
      scanForSecrets(child, childPath, findings)
    }
    return findings
  }

  if (typeof value === "string" && SECRET_VALUE_PATTERN.test(value)) {
    findings.push(`${path} has secret-like value`)
  }
  return findings
}

function summarizeEvent(event) {
  return {
    sequence: event.sequence,
    type: event.type,
    runId: event.payloadJson.runId ?? null,
    runtimeId: event.payloadJson.runtimeId ?? null,
    redaction: event.payloadJson.redaction?.status ?? null,
  }
}

function isRunEventPayload(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    typeof payload.runEventSequence === "number" &&
    typeof payload.runtimeId === "string" &&
    payload.redaction &&
    typeof payload.redaction === "object"
  )
}

export function inspectRuntimeControlSmokeJob({
  db,
  jobId,
  scenarioId,
}) {
  const failures = []
  const scenario = SCENARIOS[scenarioId]
  if (!scenario) {
    return {
      ok: false,
      failures: [`Unknown scenario: ${scenarioId}`],
      summary: null,
    }
  }

  const job = db
    .prepare(
      `select id, source, runtime, status, mode, cwd, project_id, chat_id,
              sub_chat_id, input_json, result_json, error_message
         from agent_jobs
        where id = ?`,
    )
    .get(jobId)

  if (!job) {
    return {
      ok: false,
      failures: [`agent_jobs row not found for job id: ${jobId}`],
      summary: null,
    }
  }

  if (job.source !== "desktop") {
    fail(failures, `expected job source desktop, got ${job.source}`)
  }
  if (job.runtime !== scenario.runtime) {
    fail(failures, `expected runtime ${scenario.runtime}, got ${job.runtime}`)
  }
  if (job.mode !== scenario.mode) {
    fail(failures, `expected mode ${scenario.mode}, got ${job.mode}`)
  }
  if (!TERMINAL_JOB_STATUSES.has(job.status)) {
    fail(failures, `expected terminal job status, got ${job.status}`)
  }
  if (!job.cwd) {
    fail(failures, "job cwd is missing")
  }
  if (!job.chat_id || !job.sub_chat_id) {
    fail(failures, "job chat_id or sub_chat_id is missing")
  }

  const events = db
    .prepare(
      `select sequence, type, payload_json, created_at
         from agent_job_events
        where job_id = ?
        order by sequence asc`,
    )
    .all(jobId)
    .map((event) => ({
      ...event,
      payloadJson: readJson(event.payload_json),
    }))

  if (events.length === 0) {
    fail(failures, "agent_job_events has no semantic trace events")
  }

  events.forEach((event, index) => {
    const expectedSequence = index + 1
    if (event.sequence !== expectedSequence) {
      fail(
        failures,
        `expected event sequence ${expectedSequence}, got ${event.sequence}`,
      )
    }
    const secretFindings = scanForSecrets(event.payloadJson)
    if (secretFindings.length > 0) {
      fail(
        failures,
        `event ${event.sequence} has unredacted secret-like payload: ${secretFindings.join("; ")}`,
      )
    }
  })

  const semanticEvents = events.filter((event) =>
    isRunEventPayload(event.payloadJson),
  )

  if (semanticEvents.length === 0) {
    fail(failures, "agent_job_events has no RunEvent-shaped semantic events")
  }

  const adapterStartedEvent = semanticEvents.find((event) => {
    const payload = event.payloadJson.payload
    return (
      payload &&
      typeof payload === "object" &&
      payload.status === "desktop_runtime_adapter_started"
    )
  })
  const adapterStartedPayload = adapterStartedEvent?.payloadJson.payload ?? null
  if (!adapterStartedEvent) {
    fail(failures, "semantic trace is missing desktop runtime adapter source event")
  } else if (adapterStartedPayload.adapterSource !== scenario.adapterSource) {
    fail(
      failures,
      `expected adapter source ${scenario.adapterSource}, got ${adapterStartedPayload.adapterSource}`,
    )
  }

  semanticEvents.forEach((event) => {
    if (event.payloadJson.runtimeId !== scenario.runtime) {
      fail(
        failures,
        `event ${event.sequence} expected runtimeId ${scenario.runtime}, got ${event.payloadJson.runtimeId}`,
      )
    }
    if (!event.payloadJson.runId) {
      fail(failures, `event ${event.sequence} is missing runId`)
    }
    const redactionStatus = event.payloadJson.redaction?.status
    if (redactionStatus !== "redacted" && redactionStatus !== "not-required") {
      fail(failures, `event ${event.sequence} is missing redaction status`)
    }
  })

  if (!events.some((event) => event.type === "status")) {
    fail(failures, "semantic trace is missing a status event")
  }
  if (!events.some((event) => TERMINAL_EVENT_TYPES.has(event.type))) {
    fail(failures, "semantic trace is missing a terminal completed/error event")
  }
  if (
    scenario.requiresGuardEvent &&
    !events.some((event) => GUARD_EVENT_TYPES.has(event.type))
  ) {
    fail(
      failures,
      "guard scenario is missing guard_decision, permission_requested, or scope_expansion_requested event",
    )
  }

  const inputJson = readJson(job.input_json)
  const resultJson = readJson(job.result_json)
  const eventSummary = events.map(summarizeEvent)

  return {
    ok: failures.length === 0,
    failures,
    summary: {
      scenarioId,
      job: {
        id: job.id,
        source: job.source,
        runtime: job.runtime,
        mode: job.mode,
        status: job.status,
        cwd: job.cwd,
        projectId: job.project_id,
        chatId: job.chat_id,
        subChatId: job.sub_chat_id,
        adapterSource: adapterStartedPayload?.adapterSource ?? null,
        hasInputJson: Object.keys(inputJson).length > 0,
        hasResultJson: Object.keys(resultJson).length > 0,
        errorMessage: job.error_message ?? null,
      },
      events: eventSummary,
    },
  }
}

function printUsage() {
  console.error(
    [
      "Usage:",
      "  node scripts/inspect-runtime-control-smoke-job.mjs --db=/path/agents.db --job=<job-id> --scenario=<scenario-id>",
      "",
      "Scenario IDs:",
      ...Object.keys(SCENARIOS).map((scenarioId) => `  - ${scenarioId}`),
    ].join("\n"),
  )
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const dbPath = args.db
  const jobId = args.job
  const scenarioId = args.scenario

  if (!dbPath || !jobId || !scenarioId) {
    printUsage()
    process.exitCode = 2
    return
  }
  if (!existsSync(dbPath)) {
    console.error(`[runtime-control-smoke-job] DB does not exist: ${dbPath}`)
    process.exitCode = 2
    return
  }

  const db = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const result = inspectRuntimeControlSmokeJob({ db, jobId, scenarioId })
    console.log(JSON.stringify(result.summary, null, 2))
    if (!result.ok) {
      for (const failure of result.failures) {
        console.error(`[runtime-control-smoke-job] ${failure}`)
      }
      process.exitCode = 1
    }
  } finally {
    db.close()
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
