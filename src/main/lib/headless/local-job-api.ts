import {
  createHash,
} from "node:crypto"
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { eq } from "drizzle-orm"
import type { AgentJob, AgentJobEvent } from "../db/schema"
import { agentJobs } from "../db/schema"
import {
  checkRegisteredAgentRuntimeCapability,
  listRegisteredAgentRuntimeManifests,
} from "../agent-runtime/runtime-registry"
import {
  LOCAL_JOB_API_EVENT_TYPES,
  LOCAL_JOB_API_VERSION,
  assertLocalJobApiCreateRequest,
  type LocalJobApiArtifact,
  type LocalJobApiArtifactManifest,
  type LocalJobApiEventEnvelope,
  type LocalJobApiEventType,
  type LocalJobApiResultEnvelope,
  type NormalizedLocalJobApiCreateRequest,
} from "../../../shared/local-job-api"
import {
  createAgentJob,
  getAgentJob,
  listAgentJobEvents,
  type AgentJobDatabase,
} from "./job-store"
import {
  serializeAgentJob,
  serializeAgentJobEvent,
} from "./cli-output"
import { findRegisteredProjectForCwdWithCanonicalPath } from "./schedules"

export type LocalJobApiCreatePrepared = {
  request: NormalizedLocalJobApiCreateRequest
  job: AgentJob
  runDir: string | null
}

export type LocalJobApiJobEnvelope = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  job: ReturnType<typeof serializeAgentJob>
}

export type LocalJobApiRuntimeManifestEnvelope = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  runtimes: ReturnType<typeof listRegisteredAgentRuntimeManifests>
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(
      `Invalid JSON request: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

export function parseLocalJobApiCreateRequestJson(
  value: string,
): NormalizedLocalJobApiCreateRequest {
  return assertLocalJobApiCreateRequest(parseJson(value))
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const rel = relative(parentPath, childPath)
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel))
}

function pathHasFinalComponent(path: string): boolean {
  return path
    .split(/[\\/]+/)
    .filter(Boolean)
    .some((part) => part.toLowerCase() === "final")
}

export function validateLocalJobApiArtifactBaseDir(
  artifactBaseDir: string | null,
): void {
  if (!artifactBaseDir) return
  const base = resolve(artifactBaseDir)
  if (pathHasFinalComponent(base)) {
    throw new Error("artifacts.baseDir cannot be inside a final artifact directory")
  }
}

export function prepareLocalJobApiArtifactRunDir(
  artifactBaseDir: string | null,
  jobId: string,
): string | null {
  if (!artifactBaseDir) return null
  validateLocalJobApiArtifactBaseDir(artifactBaseDir)
  const base = resolve(artifactBaseDir)
  mkdirSync(base, { recursive: true, mode: 0o700 })
  const baseReal = realpathSync(base)
  if (pathHasFinalComponent(baseReal)) {
    throw new Error("artifacts.baseDir cannot resolve inside a final artifact directory")
  }
  const runDir = join(baseReal, jobId)
  if (existsSync(runDir) && lstatSync(runDir).isSymbolicLink()) {
    throw new Error(`Artifact run directory cannot be a symlink: ${runDir}`)
  }
  mkdirSync(runDir, { recursive: true, mode: 0o700 })
  const runReal = realpathSync(runDir)
  if (!isPathInside(baseReal, runReal)) {
    throw new Error("Artifact run directory escaped artifact base directory")
  }
  return runReal
}

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function fileArtifact(role: string, path: string): LocalJobApiArtifact {
  const stat = statSync(path)
  const hash = createHash("sha256")
  hash.update(readFileSync(path))
  return {
    role,
    path,
    sha256: hash.digest("hex"),
    contentType: "application/json",
    sizeBytes: stat.size,
  }
}

function writeJsonFile(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  writeFileSync(path, stableStringify(value), { mode: 0o600 })
}

function eventCreatedAt(event: AgentJobEvent): string | null {
  const createdAt = event.createdAt
    ? event.createdAt instanceof Date
      ? event.createdAt
      : new Date(event.createdAt)
    : null
  if (!createdAt || Number.isNaN(createdAt.getTime())) return null
  return createdAt.toISOString()
}

function parsePayload(event: AgentJobEvent): unknown {
  try {
    return JSON.parse(event.payloadJson || "{}")
  } catch {
    return {}
  }
}

export function toLocalJobApiEventEnvelope(
  event: AgentJobEvent,
): LocalJobApiEventEnvelope {
  const type = (LOCAL_JOB_API_EVENT_TYPES as readonly string[]).includes(event.type)
    ? (event.type as LocalJobApiEventType)
    : "status"
  return {
    apiVersion: LOCAL_JOB_API_VERSION,
    jobId: event.jobId,
    sequence: event.sequence,
    type,
    createdAt: eventCreatedAt(event),
    payload: parsePayload(event),
  }
}

export function toLocalJobApiJobEnvelope(job: AgentJob): LocalJobApiJobEnvelope {
  return {
    apiVersion: LOCAL_JOB_API_VERSION,
    job: serializeAgentJob(job),
  }
}

export function toLocalJobApiRuntimeManifestEnvelope(): LocalJobApiRuntimeManifestEnvelope {
  return {
    apiVersion: LOCAL_JOB_API_VERSION,
    runtimes: listRegisteredAgentRuntimeManifests(),
  }
}

function parseJobResult(job: AgentJob): unknown {
  if (!job.resultJson) return null
  try {
    return JSON.parse(job.resultJson)
  } catch {
    return null
  }
}

function readArtifacts(path: string | null): LocalJobApiArtifact[] {
  if (!path || !existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      artifacts?: unknown
    }
    return Array.isArray(parsed.artifacts)
      ? (parsed.artifacts as LocalJobApiArtifact[])
      : []
  } catch {
    return []
  }
}

export function toLocalJobApiResultEnvelope(
  job: AgentJob,
  artifacts: LocalJobApiArtifact[] = readArtifacts(job.artifactManifestPath),
): LocalJobApiResultEnvelope {
  return {
    apiVersion: LOCAL_JOB_API_VERSION,
    jobId: job.id,
    status: job.status,
    runtime: job.runtime,
    mode: job.mode,
    consumer: job.apiConsumerId
      ? {
          id: job.apiConsumerId,
          runExternalId: job.apiConsumerRunId ?? null,
        }
      : null,
    artifactManifestPath: job.artifactManifestPath,
    artifacts,
    diagnostics: job.errorCode
      ? [
          {
            code: job.errorCode,
            message: job.errorMessage ?? job.errorCode,
          },
        ]
      : [],
    result: parseJobResult(job),
  }
}

export function validateLocalJobApiRequiredCapabilities(
  request: NormalizedLocalJobApiCreateRequest,
): void {
  for (const capabilityId of request.runtime.requiredCapabilities) {
    const gate = checkRegisteredAgentRuntimeCapability({
      runtime: request.runtime.id,
      capabilityId,
    })
    if (!gate.ok) {
      throw new Error(gate.diagnostic.message)
    }
  }
}

export function createLocalJobApiJob(
  db: AgentJobDatabase,
  request: NormalizedLocalJobApiCreateRequest,
  appVersion: string | null | undefined,
): LocalJobApiCreatePrepared {
  validateLocalJobApiRequiredCapabilities(request)
  validateLocalJobApiArtifactBaseDir(request.artifacts.baseDir)
  const project = findRegisteredProjectForCwdWithCanonicalPath(
    db,
    request.project.cwd,
    request.project.projectId,
    "API run cwd",
  )
  const job = createAgentJob(db, {
    source: "api",
    runtime: request.runtime.id,
    mode: request.mode,
    cwd: project.cwd,
    prompt: request.prompt.text,
    input: {
      apiVersion: request.apiVersion,
      consumer: request.consumer,
      input: request.input,
      artifacts: request.artifacts,
      prompt: request.prompt.text,
    },
    projectId: project.project.id,
    apiConsumerId: request.consumer.id,
    apiConsumerRunId: request.consumer.runExternalId,
    artifactBaseDir: request.artifacts.baseDir,
    createdByVersion: appVersion ?? null,
  })

  const runDir = prepareLocalJobApiArtifactRunDir(
    request.artifacts.baseDir,
    job.id,
  )
  if (runDir) {
    const manifestPath = join(runDir, "artifacts.json")
    db.update(agentJobs)
      .set({
        artifactBaseDir: runDir,
        artifactManifestPath: manifestPath,
      })
      .where(eq(agentJobs.id, job.id))
      .run()
  }
  return { request, job: getAgentJob(db, job.id) ?? job, runDir }
}

export function writeLocalJobApiInitialArtifacts(input: {
  runDir: string | null
  request: NormalizedLocalJobApiCreateRequest
  job: AgentJob
  events: AgentJobEvent[]
}): LocalJobApiArtifact[] {
  if (!input.runDir) return []
  const requestPath = join(input.runDir, "request.json")
  const eventsPath = join(input.runDir, "events.jsonl")
  const manifestPath = join(input.runDir, "artifacts.json")
  writeJsonFile(requestPath, input.request)
  writeFileSync(
    eventsPath,
    input.events
      .map((event) => JSON.stringify(toLocalJobApiEventEnvelope(event)))
      .join("\n") + (input.events.length > 0 ? "\n" : ""),
    { mode: 0o600 },
  )
  const artifacts = [
    fileArtifact("request", requestPath),
    fileArtifact("events", eventsPath),
  ]
  const manifest: LocalJobApiArtifactManifest = {
    apiVersion: LOCAL_JOB_API_VERSION,
    jobId: input.job.id,
    artifactBaseDir: input.runDir,
    artifacts,
    createdAt: new Date().toISOString(),
  }
  writeJsonFile(manifestPath, manifest)
  return [...artifacts, fileArtifact("manifest", manifestPath)]
}

export function writeLocalJobApiFinalArtifacts(input: {
  runDir: string | null
  job: AgentJob
  events: AgentJobEvent[]
}): LocalJobApiArtifact[] {
  if (!input.runDir) return []
  const eventsPath = join(input.runDir, "events.jsonl")
  const resultPath = join(input.runDir, "result.json")
  const manifestPath = join(input.runDir, "artifacts.json")
  writeFileSync(
    eventsPath,
    input.events
      .map((event) => JSON.stringify(toLocalJobApiEventEnvelope(event)))
      .join("\n") + (input.events.length > 0 ? "\n" : ""),
    { mode: 0o600 },
  )
  const artifacts = [
    fileArtifact("request", join(input.runDir, "request.json")),
    fileArtifact("events", eventsPath),
  ]
  writeJsonFile(resultPath, toLocalJobApiResultEnvelope(input.job, artifacts))
  artifacts.push(fileArtifact("result", resultPath))
  const manifest: LocalJobApiArtifactManifest = {
    apiVersion: LOCAL_JOB_API_VERSION,
    jobId: input.job.id,
    artifactBaseDir: input.runDir,
    artifacts,
    createdAt: new Date().toISOString(),
  }
  writeJsonFile(manifestPath, manifest)
  return [...artifacts, fileArtifact("manifest", manifestPath)]
}

export function getLocalJobApiJobOrThrow(
  db: AgentJobDatabase,
  jobId: string,
): AgentJob {
  const job = getAgentJob(db, jobId)
  if (!job) throw new Error(`Unknown API job: ${jobId}`)
  if (job.source !== "api") throw new Error(`Job ${jobId} is not an API job`)
  return job
}

export function getLocalJobApiEvents(
  db: AgentJobDatabase,
  jobId: string,
  afterSequence = 0,
): LocalJobApiEventEnvelope[] {
  getLocalJobApiJobOrThrow(db, jobId)
  return listAgentJobEvents(db, jobId, afterSequence).map(
    toLocalJobApiEventEnvelope,
  )
}

export function getSerializedLocalJobApiEvents(
  db: AgentJobDatabase,
  jobId: string,
  afterSequence = 0,
): ReturnType<typeof serializeAgentJobEvent>[] {
  getLocalJobApiJobOrThrow(db, jobId)
  return listAgentJobEvents(db, jobId, afterSequence).map(serializeAgentJobEvent)
}
