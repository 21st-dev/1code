import {
  AGENT_JOB_MODES,
  type AgentJobMode,
} from "./agent-jobs"
import {
  AGENT_RUNTIME_CAPABILITY_IDS,
  AGENT_RUNTIME_IDS,
  toAgentRuntimeId,
  type AgentRuntimeCapabilityId,
  type AgentRuntimeId,
} from "./agent-runtime-capabilities"

export const LOCAL_JOB_API_VERSION = "locus.local-job.v1" as const

export const LOCAL_JOB_API_PROJECT_NOT_REGISTERED = "project_not_registered" as const

export const LOCAL_JOB_API_WRITE_POLICIES = [
  "metadata-only",
  "proposal-only",
] as const

export type LocalJobApiWritePolicy =
  (typeof LOCAL_JOB_API_WRITE_POLICIES)[number]

export const LOCAL_JOB_API_EVENT_TYPES = [
  "job_created",
  "job_started",
  "assistant_delta",
  "reasoning_delta",
  "tool_started",
  "tool_delta",
  "tool_finished",
  "artifact_created",
  "status",
  "error",
  "completed",
] as const

export type LocalJobApiEventType = (typeof LOCAL_JOB_API_EVENT_TYPES)[number]

export type LocalJobApiConsumer = {
  id: string
  runExternalId: string | null
}

export type LocalJobApiCreateRequest = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  consumer: {
    id: string
    runExternalId?: string | null
  }
  project: {
    cwd: string
    projectId?: string | null
  }
  runtime: {
    id: AgentRuntimeId | "claude"
    requiredCapabilities?: AgentRuntimeCapabilityId[]
  }
  mode: AgentJobMode
  prompt: {
    text: string
  }
  input?: Record<string, unknown>
  artifacts?: {
    baseDir?: string | null
    writePolicy?: LocalJobApiWritePolicy
  } | null
}

export type NormalizedLocalJobApiCreateRequest = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  consumer: LocalJobApiConsumer
  project: {
    cwd: string
    projectId: string | null
  }
  runtime: {
    id: AgentRuntimeId
    requiredCapabilities: AgentRuntimeCapabilityId[]
  }
  mode: AgentJobMode
  prompt: {
    text: string
  }
  input: Record<string, unknown>
  artifacts: {
    baseDir: string | null
    writePolicy: LocalJobApiWritePolicy
  }
}

export type LocalJobApiArtifact = {
  role: string
  path: string
  sha256: string | null
  contentType: string | null
  sizeBytes: number | null
}

export type LocalJobApiArtifactManifest = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  jobId: string
  artifactBaseDir: string
  artifacts: LocalJobApiArtifact[]
  createdAt: string
}

export type LocalJobApiEventEnvelope = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  jobId: string
  sequence: number
  type: LocalJobApiEventType
  createdAt: string | null
  payload: unknown
}

export type LocalJobApiResultEnvelope = {
  apiVersion: typeof LOCAL_JOB_API_VERSION
  jobId: string
  status: string
  runtime: string
  mode: string
  consumer: LocalJobApiConsumer | null
  artifactManifestPath: string | null
  artifacts: LocalJobApiArtifact[]
  diagnostics: Array<{
    code: string
    message: string
  }>
  result: unknown
}

export type LocalJobApiValidationResult =
  | {
      ok: true
      request: NormalizedLocalJobApiCreateRequest
    }
  | {
      ok: false
      errors: string[]
    }

const MAX_CONSUMER_ID_LENGTH = 80
const MAX_EXTERNAL_ID_LENGTH = 160
const MAX_PROMPT_LENGTH = 256 * 1024
const MAX_REQUEST_JSON_LENGTH = 1024 * 1024

const SECRET_KEY_PATTERN =
  /(^|[_\-.])(api[-_]?key|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|id[-_]?token|token|secret|password|headers?|env|environment)([_\-.]|$)/i

const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----/,
  /(^|[^A-Za-z0-9_])sk-[A-Za-z0-9_-]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /bearer\s+[A-Za-z0-9._-]+/i,
  /authorization\s*:\s*basic\s+[A-Za-z0-9+/=_-]+/i,
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isAbsoluteLocalPath(value: string): boolean {
  return (
    value.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    value.startsWith("\\\\")
  )
}

function isBoundedId(value: string, maxLength: number): boolean {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function collectSecretFindings(
  value: unknown,
  path: string,
  findings: string[],
): void {
  if (typeof value === "string") {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      findings.push(`${path} contains secret-like text`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectSecretFindings(item, `${path}[${index}]`, findings)
    })
    return
  }
  if (!isRecord(value)) return

  for (const [key, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (SECRET_KEY_PATTERN.test(key)) {
      findings.push(`${childPath} is not accepted in Local Job API requests`)
      continue
    }
    collectSecretFindings(item, childPath, findings)
  }
}

function optionalString(
  value: unknown,
  fallback: string | null,
): string | null {
  if (value === undefined || value === null) return fallback
  return typeof value === "string" ? value : fallback
}

function normalizeRequiredCapabilities(
  value: unknown,
  errors: string[],
): AgentRuntimeCapabilityId[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) {
    errors.push("runtime.requiredCapabilities must be an array")
    return []
  }
  const capabilities: AgentRuntimeCapabilityId[] = []
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !(AGENT_RUNTIME_CAPABILITY_IDS as readonly string[]).includes(item)
    ) {
      errors.push("Unsupported required capability")
      continue
    }
    if (!capabilities.includes(item as AgentRuntimeCapabilityId)) {
      capabilities.push(item as AgentRuntimeCapabilityId)
    }
  }
  return capabilities
}

export function validateLocalJobApiCreateRequest(
  value: unknown,
): LocalJobApiValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) {
    return { ok: false, errors: ["Request must be a JSON object"] }
  }

  const size = JSON.stringify(value).length
  if (size > MAX_REQUEST_JSON_LENGTH) {
    errors.push(`Request JSON exceeds ${MAX_REQUEST_JSON_LENGTH} byte limit`)
  }

  if (value.apiVersion !== LOCAL_JOB_API_VERSION) {
    errors.push(`apiVersion must be ${LOCAL_JOB_API_VERSION}`)
  }

  const consumer = isRecord(value.consumer) ? value.consumer : null
  const consumerId =
    consumer && typeof consumer.id === "string" ? consumer.id.trim() : ""
  if (!isBoundedId(consumerId, MAX_CONSUMER_ID_LENGTH)) {
    errors.push(
      `consumer.id must be 1-${MAX_CONSUMER_ID_LENGTH} chars: letters, numbers, '.', '_', ':', '-'`,
    )
  }
  const runExternalId = optionalString(consumer?.runExternalId, null)
  if (
    runExternalId &&
    !isBoundedId(runExternalId, MAX_EXTERNAL_ID_LENGTH)
  ) {
    errors.push(
      `consumer.runExternalId must be 1-${MAX_EXTERNAL_ID_LENGTH} chars: letters, numbers, '.', '_', ':', '-'`,
    )
  }

  const project = isRecord(value.project) ? value.project : null
  const cwd = project && typeof project.cwd === "string" ? project.cwd : ""
  if (!cwd || !isAbsoluteLocalPath(cwd)) {
    errors.push("project.cwd must be an absolute local path")
  }
  const projectId = optionalString(project?.projectId, null)

  const runtimeInput = isRecord(value.runtime) ? value.runtime : null
  const runtimeId = toAgentRuntimeId(
    typeof runtimeInput?.id === "string" ? runtimeInput.id : null,
  )
  if (!runtimeId || !(AGENT_RUNTIME_IDS as readonly string[]).includes(runtimeId)) {
    errors.push("Unsupported runtime.id")
  }
  const requiredCapabilities = normalizeRequiredCapabilities(
    runtimeInput?.requiredCapabilities,
    errors,
  )

  const mode = typeof value.mode === "string" ? value.mode : ""
  if (!(AGENT_JOB_MODES as readonly string[]).includes(mode)) {
    errors.push("Unsupported mode")
  }

  const prompt = isRecord(value.prompt) ? value.prompt : null
  const promptText =
    prompt && typeof prompt.text === "string" ? prompt.text.trim() : ""
  if (!promptText) errors.push("prompt.text is required")
  if (promptText.length > MAX_PROMPT_LENGTH) {
    errors.push(`prompt.text exceeds ${MAX_PROMPT_LENGTH} character limit`)
  }

  const input =
    value.input === undefined || value.input === null
      ? {}
      : isRecord(value.input)
        ? value.input
        : null
  if (!input) errors.push("input must be an object when provided")

  const artifacts =
    value.artifacts === undefined || value.artifacts === null
      ? {}
      : isRecord(value.artifacts)
        ? value.artifacts
        : null
  if (!artifacts) errors.push("artifacts must be an object when provided")
  const artifactBaseDir = optionalString(artifacts?.baseDir, null)
  if (artifactBaseDir && !isAbsoluteLocalPath(artifactBaseDir)) {
    errors.push("artifacts.baseDir must be an absolute local path")
  }
  const writePolicy = optionalString(artifacts?.writePolicy, "metadata-only")
  if (
    !writePolicy ||
    !(LOCAL_JOB_API_WRITE_POLICIES as readonly string[]).includes(writePolicy)
  ) {
    errors.push("Unsupported artifacts.writePolicy")
  }

  const secretFindings: string[] = []
  collectSecretFindings(value, "", secretFindings)
  errors.push(...secretFindings)

  if (errors.length > 0 || !runtimeId || !input || !artifacts || !writePolicy) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    request: {
      apiVersion: LOCAL_JOB_API_VERSION,
      consumer: {
        id: consumerId,
        runExternalId: runExternalId || null,
      },
      project: {
        cwd,
        projectId: projectId || null,
      },
      runtime: {
        id: runtimeId,
        requiredCapabilities,
      },
      mode: mode as AgentJobMode,
      prompt: {
        text: promptText,
      },
      input,
      artifacts: {
        baseDir: artifactBaseDir || null,
        writePolicy: writePolicy as LocalJobApiWritePolicy,
      },
    },
  }
}

export function assertLocalJobApiCreateRequest(
  value: unknown,
): NormalizedLocalJobApiCreateRequest {
  const result = validateLocalJobApiCreateRequest(value)
  if (result.ok) return result.request
  throw new Error(result.errors.join("; "))
}
