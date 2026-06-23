import { and, asc, desc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/better-sqlite3"
import {
  AGENT_JOB_EVENT_TYPES,
  AGENT_JOB_MODES,
  AGENT_JOB_SOURCES,
  AGENT_JOB_STATUSES,
  type AgentJobEventType,
  type AgentJobMode,
  type AgentJobRuntime,
  type AgentJobSource,
  type AgentJobStatus,
  isTerminalAgentJobStatus,
} from "../../../shared/agent-jobs"
import {
  AGENT_RUNTIME_IDS,
  CONTRACT_RUNTIME_IDS,
} from "../../../shared/agent-runtime-capabilities"
import { createAgentJobRunEvent } from "../agent-runtime/job-event-bridge"
import type * as schema from "../db/schema"
import {
  type AgentJob,
  type AgentJobEvent,
  agentJobEvents,
  agentJobs,
} from "../db/schema"
import { createId } from "../db/utils"

export type AgentJobDatabase = ReturnType<typeof drizzle<typeof schema>>

export type CreateAgentJobInput = {
  id?: string
  source: AgentJobSource
  runtime: AgentJobRuntime
  mode: AgentJobMode
  cwd: string
  prompt: string
  input?: unknown
  projectId?: string | null
  chatId?: string | null
  subChatId?: string | null
  apiConsumerId?: string | null
  apiConsumerRunId?: string | null
  artifactBaseDir?: string | null
  artifactManifestPath?: string | null
  createdByVersion?: string | null
}

export type StartAgentJobInput = {
  jobId: string
  workerId: string
  workerPid?: number | null
  now?: Date
}

export type AppendAgentJobEventInput = {
  jobId: string
  type: AgentJobEventType
  payload?: unknown
  now?: Date
}

export type CompleteAgentJobInput = {
  jobId: string
  status: Exclude<AgentJobStatus, "queued" | "running">
  exitCode?: number | null
  errorCode?: string | null
  errorMessage?: string | null
  result?: unknown
  now?: Date
}

export type ListAgentJobsInput = {
  limit?: number
  status?: AgentJobStatus
  source?: AgentJobSource
  projectOnly?: boolean
}

export type RetryAgentJobOptions =
  | Date
  | {
      now?: Date
      id?: string
      artifactBaseDir?: string | null
      artifactManifestPath?: string | null
    }

const MAX_PROMPT_PREVIEW_LENGTH = 240
const EVENT_SEQUENCE_RETRY_LIMIT = 5

type AgentJobStoreExecutor = Pick<
  AgentJobDatabase,
  "select" | "insert" | "update"
>
type AgentJobTransaction = Parameters<
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

function assertCreateAgentJobRuntime(input: CreateAgentJobInput): void {
  const values =
    input.source === "desktop" ? AGENT_RUNTIME_IDS : CONTRACT_RUNTIME_IDS
  assertOneOf(values, input.runtime, "job runtime")
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
    .replace(
      /(authorization\s*:\s*basic\s+)[A-Za-z0-9+/=_-]+/gi,
      "$1[redacted]",
    )
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

function assertNonTerminal(job: AgentJob): void {
  if (isTerminalAgentJobStatus(job.status as AgentJobStatus)) {
    throw new Error(`Job ${job.id} is already terminal: ${job.status}`)
  }
}

function isEventSequenceConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    /agent_job_events_job_sequence_idx/i.test(error.message) ||
    /unique constraint failed: agent_job_events\.job_id,\s*agent_job_events\.sequence/i.test(
      error.message,
    )
  )
}

function withEventSequenceRetry<T>(operation: () => T): T {
  let lastError: unknown
  for (let attempt = 0; attempt < EVENT_SEQUENCE_RETRY_LIMIT; attempt += 1) {
    try {
      return operation()
    } catch (error) {
      if (!isEventSequenceConflict(error)) throw error
      lastError = error
    }
  }
  throw lastError
}

function getJobFromExecutor(
  executor: AgentJobStoreExecutor,
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

function insertAgentJobEventRecord(
  executor: AgentJobStoreExecutor,
  input: AppendAgentJobEventInput,
  now: Date,
): AgentJobEvent {
  const db = executor as AgentJobDatabase
  const eventId = createId()
  const sequence = nextEventSequence(executor, input.jobId)
  const job = getJobFromExecutor(executor, input.jobId)
  if (!job) throw new Error(`Unknown job: ${input.jobId}`)
  const bridged = createAgentJobRunEvent({
    jobId: input.jobId,
    runtimeId: job.runtime as AgentJobRuntime,
    source: job.source as AgentJobSource,
    sequence,
    type: input.type,
    payload: input.payload,
    createdAt: now,
  })

  db.insert(agentJobEvents)
    .values({
      id: eventId,
      jobId: input.jobId,
      sequence,
      type: input.type,
      payloadJson: toJson(bridged.persistedPayload),
      createdAt: now,
    })
    .run()

  const event =
    db
      .select()
      .from(agentJobEvents)
      .where(eq(agentJobEvents.id, eventId))
      .get() ?? null
  if (!event) throw new Error(`Failed to append event ${eventId}`)
  return event
}

export function createAgentJob(
  db: AgentJobDatabase,
  input: CreateAgentJobInput,
): AgentJob {
  assertOneOf(AGENT_JOB_SOURCES, input.source, "job source")
  assertCreateAgentJobRuntime(input)
  assertOneOf(AGENT_JOB_MODES, input.mode, "job mode")

  const id = input.id ?? createId()
  const now = new Date()
  db.insert(agentJobs)
    .values({
      id,
      source: input.source,
      runtime: input.runtime,
      status: "queued",
      mode: input.mode,
      cwd: input.cwd,
      promptPreview: promptPreview(input.prompt),
      inputJson:
        input.input === undefined
          ? toJson({ prompt: input.prompt })
          : toJson(input.input),
      projectId: input.projectId ?? null,
      chatId: input.chatId ?? null,
      subChatId: input.subChatId ?? null,
      apiConsumerId: input.apiConsumerId
        ? redactSecretText(input.apiConsumerId)
        : null,
      apiConsumerRunId: input.apiConsumerRunId
        ? redactSecretText(input.apiConsumerRunId)
        : null,
      artifactBaseDir: input.artifactBaseDir
        ? redactSecretText(input.artifactBaseDir)
        : null,
      artifactManifestPath: input.artifactManifestPath
        ? redactSecretText(input.artifactManifestPath)
        : null,
      createdByVersion: input.createdByVersion ?? null,
      createdAt: now,
    })
    .run()

  const job = getAgentJob(db, id)
  if (!job) throw new Error(`Failed to create job ${id}`)
  appendAgentJobEvent(db, {
    jobId: id,
    type: "job_created",
    payload: {
      source: input.source,
      runtime: input.runtime,
      mode: input.mode,
      cwd: input.cwd,
    },
    now,
  })
  return getAgentJob(db, id) ?? job
}

export function getAgentJob(
  db: AgentJobDatabase,
  jobId: string,
): AgentJob | null {
  return (
    db.select().from(agentJobs).where(eq(agentJobs.id, jobId)).get() ?? null
  )
}

export function listAgentJobs(
  db: AgentJobDatabase,
  input: ListAgentJobsInput = {},
): AgentJob[] {
  const limit = Math.max(1, Math.min(input.limit ?? 50, 200))
  const whereClauses = [
    input.status ? eq(agentJobs.status, input.status) : undefined,
    input.source ? eq(agentJobs.source, input.source) : undefined,
    input.projectOnly ? isNotNull(agentJobs.projectId) : undefined,
  ].filter(Boolean)
  const whereClause =
    whereClauses.length === 0
      ? undefined
      : whereClauses.length === 1
        ? whereClauses[0]
        : and(...whereClauses)

  if (whereClause) {
    return db
      .select()
      .from(agentJobs)
      .where(whereClause)
      .orderBy(desc(agentJobs.createdAt))
      .limit(limit)
      .all()
  }
  return db
    .select()
    .from(agentJobs)
    .orderBy(desc(agentJobs.createdAt))
    .limit(limit)
    .all()
}

export function listQueuedAgentJobsForSource(
  db: AgentJobDatabase,
  source: AgentJobSource,
  limit: number,
): AgentJob[] {
  const boundedLimit = Math.max(1, Math.min(limit, 200))
  return db
    .select()
    .from(agentJobs)
    .where(and(eq(agentJobs.source, source), eq(agentJobs.status, "queued")))
    .orderBy(asc(agentJobs.createdAt))
    .limit(boundedLimit)
    .all()
}

export function getAgentJobPrompt(db: AgentJobDatabase, jobId: string): string {
  const job = getAgentJob(db, jobId)
  if (!job) throw new Error(`Unknown job: ${jobId}`)
  const input = fromJson<{ prompt?: unknown }>(job.inputJson, {})
  return typeof input.prompt === "string" ? input.prompt : ""
}

export function startAgentJob(
  db: AgentJobDatabase,
  input: StartAgentJobInput,
): AgentJob {
  const now = input.now ?? new Date()
  return withEventSequenceRetry(() => {
    return db.transaction((tx: AgentJobTransaction) => {
      const job = getJobFromExecutor(tx, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      assertNonTerminal(job)
      if (job.status !== "queued") {
        throw new Error(`Job ${job.id} cannot start from status ${job.status}`)
      }

      tx.update(agentJobs)
        .set({
          status: "running",
          startedAt: now,
          workerId: input.workerId,
          workerPid: input.workerPid ?? null,
          workerStartedAt: now,
          heartbeatAt: now,
        })
        .where(eq(agentJobs.id, input.jobId))
        .run()
      insertAgentJobEventRecord(
        tx,
        {
          jobId: input.jobId,
          type: "job_started",
          payload: {
            workerId: input.workerId,
            workerPid: input.workerPid ?? null,
          },
          now,
        },
        now,
      )

      return getJobFromExecutor(tx, input.jobId) ?? job
    })
  })
}

export function appendAgentJobEvent(
  db: AgentJobDatabase,
  input: AppendAgentJobEventInput,
): AgentJobEvent {
  assertOneOf(AGENT_JOB_EVENT_TYPES, input.type, "job event type")
  const now = input.now ?? new Date()

  return withEventSequenceRetry(() => {
    return db.transaction((tx: AgentJobTransaction) => {
      const job = getJobFromExecutor(tx, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      assertNonTerminal(job)
      return insertAgentJobEventRecord(tx, input, now)
    })
  })
}

export function listAgentJobEvents(
  db: AgentJobDatabase,
  jobId: string,
  afterSequence = 0,
): AgentJobEvent[] {
  return db
    .select()
    .from(agentJobEvents)
    .where(
      and(
        eq(agentJobEvents.jobId, jobId),
        gtSequence(agentJobEvents.sequence, afterSequence),
      ),
    )
    .orderBy(agentJobEvents.sequence)
    .all()
}

function gtSequence(column: typeof agentJobEvents.sequence, value: number) {
  return sql`${column} > ${value}`
}

export function heartbeatAgentJob(
  db: AgentJobDatabase,
  jobId: string,
  workerId: string,
  now = new Date(),
): AgentJob {
  const job = getAgentJob(db, jobId)
  if (!job) throw new Error(`Unknown job: ${jobId}`)
  if (job.status !== "running") {
    throw new Error(`Job ${job.id} cannot heartbeat from status ${job.status}`)
  }
  if (job.workerId !== workerId) {
    throw new Error(`Job ${job.id} is owned by another worker`)
  }

  db.update(agentJobs)
    .set({ heartbeatAt: now })
    .where(eq(agentJobs.id, jobId))
    .run()
  return getAgentJob(db, jobId) ?? job
}

export function requestCancelAgentJob(
  db: AgentJobDatabase,
  jobId: string,
  requestedBy: string,
  now = new Date(),
): AgentJob {
  return withEventSequenceRetry(() => {
    return db.transaction((tx: AgentJobTransaction) => {
      const job = getJobFromExecutor(tx, jobId)
      if (!job) throw new Error(`Unknown job: ${jobId}`)
      if (isTerminalAgentJobStatus(job.status as AgentJobStatus)) return job

      tx.update(agentJobs)
        .set({
          cancelRequestedAt: job.cancelRequestedAt ?? now,
          cancelRequestedBy: job.cancelRequestedBy ?? requestedBy,
        })
        .where(eq(agentJobs.id, jobId))
        .run()
      insertAgentJobEventRecord(
        tx,
        {
          jobId,
          type: "status",
          payload: { status: "cancel_requested", requestedBy },
          now,
        },
        now,
      )
      return getJobFromExecutor(tx, jobId) ?? job
    })
  })
}

export function completeAgentJob(
  db: AgentJobDatabase,
  input: CompleteAgentJobInput,
): AgentJob {
  assertOneOf(AGENT_JOB_STATUSES, input.status, "job status")
  const now = input.now ?? new Date()

  return withEventSequenceRetry(() => {
    return db.transaction((tx: AgentJobTransaction) => {
      const job = getJobFromExecutor(tx, input.jobId)
      if (!job) throw new Error(`Unknown job: ${input.jobId}`)
      assertNonTerminal(job)

      tx.update(agentJobs)
        .set({
          status: input.status,
          finishedAt: now,
          exitCode: input.exitCode ?? null,
          errorCode: input.errorCode ?? null,
          errorMessage: input.errorMessage
            ? redactSecretText(input.errorMessage)
            : null,
          resultJson: input.result === undefined ? null : toJson(input.result),
          heartbeatAt: now,
        })
        .where(eq(agentJobs.id, input.jobId))
        .run()

      insertAgentJobEventRecord(
        tx,
        {
          jobId: input.jobId,
          type: "completed",
          payload: {
            status: input.status,
            exitCode: input.exitCode ?? null,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
            result: input.result ?? null,
          },
          now,
        },
        now,
      )

      return getJobFromExecutor(tx, input.jobId) ?? job
    })
  })
}

function nextEventSequence(
  executor: AgentJobStoreExecutor,
  jobId: string,
): number {
  const latest = (executor as AgentJobDatabase)
    .select({
      maxSequence: sql<number>`coalesce(max(${agentJobEvents.sequence}), 0)`,
    })
    .from(agentJobEvents)
    .where(eq(agentJobEvents.jobId, jobId))
    .get()
  return (latest?.maxSequence ?? 0) + 1
}

export function interruptStaleAgentJobs(
  db: AgentJobDatabase,
  staleBefore: Date,
  now = new Date(),
): AgentJob[] {
  const staleJobs = db
    .select()
    .from(agentJobs)
    .where(
      and(
        eq(agentJobs.status, "running"),
        or(
          isNull(agentJobs.heartbeatAt),
          lt(agentJobs.heartbeatAt, staleBefore),
        ),
      ),
    )
    .all()

  for (const job of staleJobs) {
    withEventSequenceRetry(() => {
      db.transaction((tx: AgentJobTransaction) => {
        const current = getJobFromExecutor(tx, job.id)
        if (
          !current ||
          current.status !== "running" ||
          (current.heartbeatAt && current.heartbeatAt >= staleBefore)
        ) {
          return
        }

        tx.update(agentJobs)
          .set({
            status: "interrupted",
            finishedAt: now,
            errorCode: "worker_interrupted",
            errorMessage: "Worker heartbeat was lost.",
          })
          .where(eq(agentJobs.id, job.id))
          .run()
        insertAgentJobEventRecord(
          tx,
          {
            jobId: job.id,
            type: "error",
            payload: {
              status: "interrupted",
              errorCode: "worker_interrupted",
            },
            now,
          },
          now,
        )
      })
    })
  }

  return staleJobs
    .map((job) => getAgentJob(db, job.id))
    .filter(Boolean) as AgentJob[]
}

export function retryAgentJob(
  db: AgentJobDatabase,
  jobId: string,
  optionsOrNow: RetryAgentJobOptions = new Date(),
): AgentJob {
  const options =
    optionsOrNow instanceof Date ? { now: optionsOrNow } : optionsOrNow
  const now = options.now ?? new Date()
  const job = getAgentJob(db, jobId)
  if (!job) throw new Error(`Unknown job: ${jobId}`)
  if (
    job.status !== "failed" &&
    job.status !== "canceled" &&
    job.status !== "interrupted"
  ) {
    throw new Error(`Job ${job.id} cannot be retried from status ${job.status}`)
  }

  const retryId = options.id ?? createId()
  db.insert(agentJobs)
    .values({
      id: retryId,
      retryOfJobId: job.id,
      attempt: job.attempt + 1,
      source: job.source,
      runtime: job.runtime,
      status: "queued",
      mode: job.mode,
      cwd: job.cwd,
      projectId: job.projectId,
      chatId: job.chatId,
      subChatId: job.subChatId,
      promptPreview: job.promptPreview,
      inputJson: job.inputJson,
      apiConsumerId: job.apiConsumerId,
      apiConsumerRunId: job.apiConsumerRunId,
      artifactBaseDir:
        options.artifactBaseDir !== undefined
          ? options.artifactBaseDir
          : job.artifactBaseDir,
      artifactManifestPath: options.artifactManifestPath ?? null,
      createdAt: now,
      createdByVersion: job.createdByVersion,
    })
    .run()
  appendAgentJobEvent(db, {
    jobId: retryId,
    type: "job_created",
    payload: {
      retryOfJobId: job.id,
      attempt: job.attempt + 1,
    },
    now,
  })
  const retry = getAgentJob(db, retryId)
  if (!retry) throw new Error(`Failed to create retry job ${retryId}`)
  return retry
}
