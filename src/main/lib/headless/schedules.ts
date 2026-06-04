import { existsSync, realpathSync } from "node:fs"
import { isAbsolute, relative, resolve } from "node:path"
import { and, asc, desc, eq, lte, ne } from "drizzle-orm"
import {
  agentJobEvents,
  agentJobs,
  agentScheduleRuns,
  agentSchedules,
  projects,
  type AgentJob,
  type AgentSchedule,
  type AgentScheduleRun,
  type Project,
} from "../db/schema"
import { createId } from "../db/utils"
import {
  AGENT_JOB_MODES,
  type AgentJobMode,
  type AgentJobRuntime,
} from "../../../shared/agent-jobs"
import { AGENT_RUNTIME_IDS } from "../../../shared/agent-runtime-capabilities"
import {
  AGENT_SCHEDULE_STATUSES,
  AGENT_SCHEDULE_TRIGGERS,
  MAX_AGENT_SCHEDULE_INTERVAL_SECONDS,
  MIN_AGENT_SCHEDULE_INTERVAL_SECONDS,
  type AgentScheduleStatus,
  type AgentScheduleTrigger,
} from "../../../shared/agent-schedules"
import {
  type AgentJobDatabase,
} from "./job-store"

export type CreateAgentScheduleInput = {
  name: string
  runtime: AgentJobRuntime
  mode: AgentJobMode
  cwd: string
  prompt: string
  intervalSeconds: number
  projectId?: string | null
  timezone?: string
  nextRunAt?: Date | null
  now?: Date
}

export type ListAgentSchedulesInput = {
  includeDisabled?: boolean
  status?: AgentScheduleStatus
  limit?: number
}

export type EvaluateDueAgentSchedulesInput = {
  now?: Date
  limit?: number
}

export type FiredAgentSchedule = {
  schedule: AgentSchedule
  job: AgentJob
  run: AgentScheduleRun
}

const MAX_SCHEDULE_LIMIT = 200
const MAX_PROMPT_PREVIEW_LENGTH = 240

type AgentScheduleStoreExecutor = Pick<
  AgentJobDatabase,
  "select" | "insert" | "update"
>
type AgentScheduleTransaction = Parameters<
  Parameters<AgentJobDatabase["transaction"]>[0]
>[0]

function assertOneOf<T extends readonly string[]>(
  values: T,
  value: string,
  label: string,
): asserts value is T[number] {
  if (!(values as readonly string[]).includes(value)) {
    throw new Error(`Unsupported ${label}: ${value}`)
  }
}

function assertScheduleStatus(status: string): asserts status is AgentScheduleStatus {
  assertOneOf(AGENT_SCHEDULE_STATUSES, status, "schedule status")
}

function assertScheduleTrigger(
  trigger: string,
): asserts trigger is AgentScheduleTrigger {
  assertOneOf(AGENT_SCHEDULE_TRIGGERS, trigger, "schedule trigger")
}

function assertScheduleInterval(intervalSeconds: number): void {
  if (
    !Number.isInteger(intervalSeconds) ||
    intervalSeconds < MIN_AGENT_SCHEDULE_INTERVAL_SECONDS ||
    intervalSeconds > MAX_AGENT_SCHEDULE_INTERVAL_SECONDS
  ) {
    throw new Error(
      `Schedule interval must be between ${MIN_AGENT_SCHEDULE_INTERVAL_SECONDS} and ${MAX_AGENT_SCHEDULE_INTERVAL_SECONDS} seconds`,
    )
  }
}

function redactSecretText(value: string): string {
  return value
    .replace(
      /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/g,
      "[redacted-pem]",
    )
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[redacted]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "[redacted]")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[redacted]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[redacted-jwt]",
    )
    .replace(/(authorization\s*:\s*basic\s+)[A-Za-z0-9+/=_-]+/gi, "$1[redacted]")
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /((?:access_token|refresh_token|id_token|anthropic_auth_token|openai_api_key|codex_api_key|github_token|npm_token|aws_secret_access_key|aws_session_token|api[-_]?key|secret|password)["'=:\s]+)["']?[^\s"',;]+/gi,
      "$1[redacted]",
    )
    .replace(
      /([?&](?:code|access_token|refresh_token|id_token|token)=)[^&#\s]+/gi,
      "$1[redacted]",
    )
}

function sanitizeForStorage(value: unknown): unknown {
  if (typeof value === "string") return redactSecretText(value)
  if (Array.isArray(value)) return value.map(sanitizeForStorage)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => {
        if (
          /token|authorization|api[-_]?key|secret|password/i.test(key) &&
          item !== null &&
          item !== undefined
        ) {
          return [key, "[redacted]"]
        }
        return [key, sanitizeForStorage(item)]
      }),
    )
  }
  return value
}

function toJson(value: unknown): string {
  return JSON.stringify(sanitizeForStorage(value ?? {}))
}

function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function promptPreview(prompt: string): string {
  const compact = prompt.replace(/\s+/g, " ").trim()
  const truncated =
    compact.length > MAX_PROMPT_PREVIEW_LENGTH
      ? `${compact.slice(0, MAX_PROMPT_PREVIEW_LENGTH - 1)}...`
      : compact
  return redactSecretText(truncated)
}

function normalizeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Schedule name is required")
  return trimmed
}

function canonicalExistingPath(path: string, label: string): string {
  const resolved = resolve(path)
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${path}`)
  return realpathSync(resolved)
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const rel = relative(parentPath, childPath)
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel))
}

function getProject(db: AgentJobDatabase, projectId: string): Project | null {
  return db.select().from(projects).where(eq(projects.id, projectId)).get() ?? null
}

export function findRegisteredProjectForCwd(
  db: AgentJobDatabase,
  cwd: string,
  projectId?: string | null,
  label = "Schedule cwd",
): Project {
  const cwdReal = canonicalExistingPath(cwd, label)

  if (projectId) {
    const project = getProject(db, projectId)
    if (!project) throw new Error(`Unknown project: ${projectId}`)
    const projectReal = canonicalExistingPath(project.path, "Registered project path")
    if (!isPathInside(projectReal, cwdReal)) {
      throw new Error(`${label} must be inside the registered project path`)
    }
    return project
  }

  const registeredProjects = db.select().from(projects).all()
  for (const project of registeredProjects) {
    if (!project.path) continue
    let projectReal: string
    try {
      projectReal = canonicalExistingPath(project.path, "Registered project path")
    } catch {
      continue
    }
    if (isPathInside(projectReal, cwdReal)) return project
  }

  throw new Error(`${label} must be inside a registered project`)
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000)
}

function nextRunAfter(schedule: AgentSchedule, scheduledFor: Date, now: Date): Date {
  let next = addSeconds(scheduledFor, schedule.intervalSeconds)
  while (next <= now) {
    next = addSeconds(next, schedule.intervalSeconds)
  }
  return next
}

function boundedLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? 50, MAX_SCHEDULE_LIMIT))
}

function getSchedulePrompt(schedule: AgentSchedule): string {
  const input = fromJson<{ prompt?: unknown }>(schedule.inputJson, {})
  return typeof input.prompt === "string" ? input.prompt : ""
}

function getScheduleFromExecutor(
  executor: AgentScheduleStoreExecutor,
  scheduleId: string,
): AgentSchedule | null {
  return (
    (executor as AgentJobDatabase)
      .select()
      .from(agentSchedules)
      .where(eq(agentSchedules.id, scheduleId))
      .get() ?? null
  )
}

function getJobFromExecutor(
  executor: AgentScheduleStoreExecutor,
  jobId: string,
): AgentJob | null {
  return (
    (executor as AgentJobDatabase)
      .select()
      .from(agentJobs)
      .where(eq(agentJobs.id, jobId))
      .get() ?? null
  )
}

function insertScheduleRun(
  executor: AgentScheduleStoreExecutor,
  scheduleId: string,
  jobId: string,
  trigger: AgentScheduleTrigger,
  scheduledFor: Date,
  now: Date,
): AgentScheduleRun {
  const db = executor as AgentJobDatabase
  const id = createId()
  db.insert(agentScheduleRuns)
    .values({
      id,
      scheduleId,
      jobId,
      trigger,
      scheduledFor,
      createdAt: now,
    })
    .run()
  const run =
    db.select().from(agentScheduleRuns).where(eq(agentScheduleRuns.id, id)).get() ??
    null
  if (!run) throw new Error(`Failed to create schedule run ${id}`)
  return run
}

function updateScheduleAfterFire(
  executor: AgentScheduleStoreExecutor,
  schedule: AgentSchedule,
  job: AgentJob,
  trigger: AgentScheduleTrigger,
  scheduledFor: Date,
  now: Date,
): AgentSchedule {
  const db = executor as AgentJobDatabase
  const nextRunAt =
    trigger === "due" ? nextRunAfter(schedule, scheduledFor, now) : schedule.nextRunAt
  db.update(agentSchedules)
    .set({
      lastRunAt: now,
      lastJobId: job.id,
      nextRunAt,
      updatedAt: now,
    })
    .where(eq(agentSchedules.id, schedule.id))
    .run()
  return getScheduleFromExecutor(db, schedule.id) ?? schedule
}

function createScheduleJobRecord(
  executor: AgentScheduleStoreExecutor,
  schedule: AgentSchedule,
  trigger: AgentScheduleTrigger,
  scheduledFor: Date,
  prompt: string,
  now: Date,
): AgentJob {
  const db = executor as AgentJobDatabase
  const jobId = createId()
  db.insert(agentJobs)
    .values({
      id: jobId,
      source: "schedule",
      runtime: schedule.runtime,
      status: "queued",
      mode: schedule.mode,
      cwd: schedule.cwd,
      promptPreview: promptPreview(prompt),
      inputJson: toJson({
        prompt,
        scheduleId: schedule.id,
        trigger,
        scheduledFor: scheduledFor.toISOString(),
      }),
      projectId: schedule.projectId,
      createdAt: now,
    })
    .run()

  db.insert(agentJobEvents)
    .values({
      id: createId(),
      jobId,
      sequence: 1,
      type: "job_created",
      payloadJson: toJson({
        source: "schedule",
        runtime: schedule.runtime,
        mode: schedule.mode,
        cwd: schedule.cwd,
        scheduleId: schedule.id,
        trigger,
        scheduledFor: scheduledFor.toISOString(),
      }),
      createdAt: now,
    })
    .run()

  const job = getJobFromExecutor(db, jobId)
  if (!job) throw new Error(`Failed to create schedule job ${jobId}`)
  return job
}

function fireAgentSchedule(
  db: AgentJobDatabase,
  schedule: AgentSchedule,
  trigger: AgentScheduleTrigger,
  scheduledFor: Date,
  now: Date,
): FiredAgentSchedule | null {
  assertScheduleTrigger(trigger)
  assertOneOf(AGENT_RUNTIME_IDS, schedule.runtime, "job runtime")
  assertOneOf(AGENT_JOB_MODES, schedule.mode, "job mode")
  findRegisteredProjectForCwd(db, schedule.cwd, schedule.projectId)

  return db.transaction((tx: AgentScheduleTransaction) => {
    const current = getScheduleFromExecutor(tx, schedule.id)
    if (!current) throw new Error(`Unknown schedule: ${schedule.id}`)
    if (current.status === "disabled") {
      throw new Error(`Schedule ${schedule.id} is disabled`)
    }
    if (
      trigger === "due" &&
      (current.status !== "enabled" ||
        !current.nextRunAt ||
        current.nextRunAt > now ||
        current.nextRunAt.getTime() !== scheduledFor.getTime())
    ) {
      return null
    }

    const prompt = getSchedulePrompt(current)
    const job = createScheduleJobRecord(tx, current, trigger, scheduledFor, prompt, now)
    const run = insertScheduleRun(tx, current.id, job.id, trigger, scheduledFor, now)
    const updated = updateScheduleAfterFire(
      tx,
      current,
      job,
      trigger,
      scheduledFor,
      now,
    )
    return { schedule: updated, job, run }
  })
}

export function createAgentSchedule(
  db: AgentJobDatabase,
  input: CreateAgentScheduleInput,
): AgentSchedule {
  assertOneOf(AGENT_RUNTIME_IDS, input.runtime, "job runtime")
  assertOneOf(AGENT_JOB_MODES, input.mode, "job mode")
  assertScheduleInterval(input.intervalSeconds)

  const now = input.now ?? new Date()
  const project = findRegisteredProjectForCwd(db, input.cwd, input.projectId)
  const id = createId()
  const nextRunAt =
    input.nextRunAt === null
      ? null
      : input.nextRunAt === undefined
        ? addSeconds(now, input.intervalSeconds)
        : input.nextRunAt

  db.insert(agentSchedules)
    .values({
      id,
      name: normalizeName(input.name),
      status: "enabled",
      runtime: input.runtime,
      mode: input.mode,
      cwd: input.cwd,
      projectId: project.id,
      promptPreview: promptPreview(input.prompt),
      inputJson: toJson({ prompt: input.prompt }),
      intervalSeconds: input.intervalSeconds,
      timezone: input.timezone?.trim() || "local",
      nextRunAt,
      createdAt: now,
      updatedAt: now,
    })
    .run()

  const schedule = getAgentSchedule(db, id)
  if (!schedule) throw new Error(`Failed to create schedule ${id}`)
  return schedule
}

export function getAgentSchedule(
  db: AgentJobDatabase,
  scheduleId: string,
): AgentSchedule | null {
  return (
    db.select().from(agentSchedules).where(eq(agentSchedules.id, scheduleId)).get() ??
    null
  )
}

export function listAgentSchedules(
  db: AgentJobDatabase,
  input: ListAgentSchedulesInput = {},
): AgentSchedule[] {
  if (input.status) assertScheduleStatus(input.status)
  const limit = boundedLimit(input.limit)
  const whereClauses = [
    input.status ? eq(agentSchedules.status, input.status) : undefined,
    !input.includeDisabled && !input.status
      ? ne(agentSchedules.status, "disabled")
      : undefined,
  ].filter(Boolean)
  const whereClause =
    whereClauses.length === 0
      ? undefined
      : whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses)

  const baseQuery = db
    .select()
    .from(agentSchedules)
    .orderBy(desc(agentSchedules.createdAt))
    .limit(limit)

  if (!whereClause) return baseQuery.all()
  return db
    .select()
    .from(agentSchedules)
    .where(whereClause)
    .orderBy(desc(agentSchedules.createdAt))
    .limit(limit)
    .all()
}

export function listAgentScheduleRuns(
  db: AgentJobDatabase,
  scheduleId: string,
  limit = 50,
): AgentScheduleRun[] {
  return db
    .select()
    .from(agentScheduleRuns)
    .where(eq(agentScheduleRuns.scheduleId, scheduleId))
    .orderBy(desc(agentScheduleRuns.createdAt))
    .limit(boundedLimit(limit))
    .all()
}

export function updateAgentScheduleStatus(
  db: AgentJobDatabase,
  scheduleId: string,
  status: AgentScheduleStatus,
  now = new Date(),
): AgentSchedule {
  assertScheduleStatus(status)
  const schedule = getAgentSchedule(db, scheduleId)
  if (!schedule) throw new Error(`Unknown schedule: ${scheduleId}`)
  if (schedule.status === "disabled" && status !== "disabled") {
    throw new Error(`Schedule ${schedule.id} is disabled`)
  }
  const nextRunAt =
    status === "enabled" &&
    (!schedule.nextRunAt || schedule.nextRunAt <= now)
      ? addSeconds(now, schedule.intervalSeconds)
      : schedule.nextRunAt
  db.update(agentSchedules)
    .set({
      status,
      nextRunAt,
      disabledAt: status === "disabled" ? now : null,
      updatedAt: now,
    })
    .where(eq(agentSchedules.id, schedule.id))
    .run()
  return getAgentSchedule(db, schedule.id) ?? schedule
}

export function pauseAgentSchedule(
  db: AgentJobDatabase,
  scheduleId: string,
  now = new Date(),
): AgentSchedule {
  return updateAgentScheduleStatus(db, scheduleId, "paused", now)
}

export function resumeAgentSchedule(
  db: AgentJobDatabase,
  scheduleId: string,
  now = new Date(),
): AgentSchedule {
  return updateAgentScheduleStatus(db, scheduleId, "enabled", now)
}

export function disableAgentSchedule(
  db: AgentJobDatabase,
  scheduleId: string,
  now = new Date(),
): AgentSchedule {
  return updateAgentScheduleStatus(db, scheduleId, "disabled", now)
}

export function deleteAgentSchedule(
  db: AgentJobDatabase,
  scheduleId: string,
  now = new Date(),
): AgentSchedule {
  return disableAgentSchedule(db, scheduleId, now)
}

export function runAgentScheduleNow(
  db: AgentJobDatabase,
  scheduleId: string,
  now = new Date(),
): FiredAgentSchedule {
  const schedule = getAgentSchedule(db, scheduleId)
  if (!schedule) throw new Error(`Unknown schedule: ${scheduleId}`)
  const fired = fireAgentSchedule(db, schedule, "manual", now, now)
  if (!fired) throw new Error(`Schedule ${scheduleId} is not runnable`)
  return fired
}

export function evaluateDueAgentSchedules(
  db: AgentJobDatabase,
  input: EvaluateDueAgentSchedulesInput = {},
): FiredAgentSchedule[] {
  const now = input.now ?? new Date()
  const dueSchedules = db
    .select()
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.status, "enabled"),
        lte(agentSchedules.nextRunAt, now),
      ),
    )
    .orderBy(asc(agentSchedules.nextRunAt))
    .limit(boundedLimit(input.limit))
    .all()

  const fired: FiredAgentSchedule[] = []
  for (const schedule of dueSchedules) {
    const current = getAgentSchedule(db, schedule.id)
    if (
      !current ||
      current.status !== "enabled" ||
      !current.nextRunAt ||
      current.nextRunAt > now
    ) {
      continue
    }
    try {
      const firedSchedule = fireAgentSchedule(db, current, "due", current.nextRunAt, now)
      if (firedSchedule) fired.push(firedSchedule)
    } catch {
      disableAgentSchedule(db, current.id, now)
    }
  }
  return fired
}
