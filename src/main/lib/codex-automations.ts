import { mkdir, readFile, readdir, rm, writeFile } from "fs/promises"
import { homedir } from "os"
import { join, resolve, sep } from "path"
import { parseTOML, stringifyTOML } from "confbox/toml"

export type LocalCodexAutomationRecord = Record<string, unknown> & {
  id: string
  source: "codex-local"
  sourcePath: string
}

type AutomationInput = Record<string, unknown>

const AUTOMATION_FILE_NAME = "automation.toml"
const AUTOMATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const HERMES_AUTOMATION_MODEL_ID = "moss-default"
const AUTOMATION_ENGINE_IDS = [
  "hermes",
  "codex",
  "claude-code",
  "custom-acp",
] as const
type LocalAutomationEngineId = (typeof AUTOMATION_ENGINE_IDS)[number]

export function getCodexAutomationsRoot(): string {
  const codexHome = expandHome(process.env.CODEX_HOME?.trim() || "~/.codex")
  return join(codexHome, "automations")
}

export async function listLocalCodexAutomations(): Promise<
  LocalCodexAutomationRecord[]
> {
  const root = getCodexAutomationsRoot()
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) return []
    throw error
  }

  const records = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readLocalCodexAutomation(entry.name)),
  )

  return records
    .filter((record): record is LocalCodexAutomationRecord => Boolean(record))
    .sort((a, b) => getAutomationTime(b) - getAutomationTime(a))
}

export async function createLocalCodexAutomation(
  input: AutomationInput,
): Promise<LocalCodexAutomationRecord> {
  const now = Date.now()
  const id = await reserveAutomationId(asString(input.id) || asString(input.name))
  const kind = asString(input.kind) || inferAutomationKind(input)
  const prompt = asString(input.prompt) || asString(input.agentPrompt)
  const executionEnvironment =
    asString(input.executionEnvironment) ||
    asString(input.execution_environment) ||
    (kind === "heartbeat" ? null : "worktree")
  const model = asString(input.model) || HERMES_AUTOMATION_MODEL_ID
  const engine = normalizeAutomationEngine(input, model)

  const stored: Record<string, unknown> = {
    version: 1,
    id,
    kind,
    name: asString(input.name) || "未命名自动化",
    prompt,
    status: asString(input.status) || "ACTIVE",
    rrule: asString(input.rrule) || "FREQ=HOURLY;INTERVAL=1",
    model,
    engine,
    reasoning_effort:
      asString(input.reasoning_effort) ||
      asString(input.reasoningEffort) ||
      "high",
    created_at: now,
    updated_at: now,
  }

  const cwds = asStringArray(input.cwds)
  if (cwds.length > 0) stored.cwds = cwds
  if (executionEnvironment) stored.execution_environment = executionEnvironment

  const targetThreadId =
    asString(input.targetThreadId) || asString(input.target_thread_id)
  if (targetThreadId) stored.target_thread_id = targetThreadId

  await writeAutomationById(id, stored)
  const created = await readLocalCodexAutomation(id)
  if (!created) throw new Error(`Failed to create automation ${id}`)
  return created
}

export async function updateLocalCodexAutomation(
  input: AutomationInput,
): Promise<LocalCodexAutomationRecord> {
  const id = requireAutomationId(input)
  const current = await readStoredAutomation(id)
  if (!current) throw new Error(`Automation not found: ${id}`)

  const next: Record<string, unknown> = { ...current }
  if (typeof input.status === "string") next.status = input.status
  if (typeof input.isEnabled === "boolean") {
    next.status = input.isEnabled ? "ACTIVE" : "PAUSED"
  }
  copyStringField(input, next, "name")
  copyStringField(input, next, "prompt")
  copyStringField(input, next, "rrule")
  copyStringField(input, next, "model")
  copyStringField(input, next, "kind")

  const model = asString(next.model) || HERMES_AUTOMATION_MODEL_ID
  const nextEngine = normalizeAutomationEngine({ ...next, ...input }, model)
  if (nextEngine) next.engine = nextEngine

  const reasoning = asString(input.reasoning_effort) || asString(input.reasoningEffort)
  if (reasoning) next.reasoning_effort = reasoning
  const executionEnvironment =
    asString(input.execution_environment) || asString(input.executionEnvironment)
  if (executionEnvironment) next.execution_environment = executionEnvironment
  const cwds = asStringArray(input.cwds)
  if (cwds.length > 0) next.cwds = cwds

  next.updated_at = Date.now()
  await writeAutomationById(id, next)
  const updated = await readLocalCodexAutomation(id)
  if (!updated) throw new Error(`Failed to update automation ${id}`)
  return updated
}

export async function deleteLocalCodexAutomation(
  input: AutomationInput,
): Promise<{ ok: true; id: string }> {
  const id = requireAutomationId(input)
  const dir = resolveAutomationDir(id)
  if (!dir) throw new Error(`Invalid automation id: ${id}`)
  await rm(dir, { force: true, recursive: true })
  return { ok: true, id }
}

export async function runLocalCodexAutomationNow(
  input: AutomationInput,
): Promise<LocalCodexAutomationRecord> {
  const id = requireAutomationId(input)
  const current = await readStoredAutomation(id)
  if (!current) throw new Error(`Automation not found: ${id}`)

  await writeAutomationById(id, {
    ...current,
    last_run_at: Date.now(),
    updated_at: Date.now(),
  })

  const updated = await readLocalCodexAutomation(id)
  if (!updated) throw new Error(`Failed to run automation ${id}`)
  return updated
}

export function parseCodexAutomationToml(text: string): Record<string, unknown> {
  return parseTOML<Record<string, unknown>>(text)
}

async function readLocalCodexAutomation(
  id: string,
): Promise<LocalCodexAutomationRecord | null> {
  const sourcePath = resolveAutomationFile(id)
  if (!sourcePath) return null

  try {
    const text = await readFile(sourcePath, "utf8")
    const parsed = parseCodexAutomationToml(text)
    const parsedId = asString(parsed.id) || id
    if (!AUTOMATION_ID_PATTERN.test(parsedId)) return null
    return normalizeLocalRecord(parsed, parsedId, sourcePath)
  } catch (error) {
    if (isMissingPathError(error)) return null
    console.warn("[codex-automations] Failed to read automation:", id, error)
    return null
  }
}

async function readStoredAutomation(
  id: string,
): Promise<Record<string, unknown> | null> {
  const sourcePath = resolveAutomationFile(id)
  if (!sourcePath) return null
  try {
    return parseCodexAutomationToml(await readFile(sourcePath, "utf8"))
  } catch (error) {
    if (isMissingPathError(error)) return null
    throw error
  }
}

async function writeAutomationById(
  id: string,
  automation: Record<string, unknown>,
): Promise<void> {
  const dir = resolveAutomationDir(id)
  if (!dir) throw new Error(`Invalid automation id: ${id}`)
  await mkdir(dir, { recursive: true })
  const filePath = join(dir, AUTOMATION_FILE_NAME)
  await writeFile(filePath, stringifyTOML(orderAutomationFields(automation)), "utf8")
}

async function reserveAutomationId(seed: string | null): Promise<string> {
  const base = slugAutomationId(seed || "automation")
  let candidate = base
  let suffix = 2
  while (await readLocalCodexAutomation(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  return candidate
}

function slugAutomationId(value: string): string {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
  return AUTOMATION_ID_PATTERN.test(ascii) ? ascii : `automation-${Date.now()}`
}

function resolveAutomationFile(id: string): string | null {
  const dir = resolveAutomationDir(id)
  return dir ? join(dir, AUTOMATION_FILE_NAME) : null
}

function resolveAutomationDir(id: string): string | null {
  if (!AUTOMATION_ID_PATTERN.test(id)) return null
  const root = resolve(getCodexAutomationsRoot())
  const dir = resolve(root, id)
  return dir === root || !dir.startsWith(`${root}${sep}`) ? null : dir
}

function normalizeLocalRecord(
  raw: Record<string, unknown>,
  id: string,
  sourcePath: string,
): LocalCodexAutomationRecord {
  return {
    ...raw,
    id,
    source: "codex-local",
    sourcePath,
    engine: normalizeAutomationEngine(raw, asString(raw.model) || HERMES_AUTOMATION_MODEL_ID),
    hostName: raw.hostName ?? raw.host_name ?? "本机",
  }
}

function orderAutomationFields(
  automation: Record<string, unknown>,
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {}
  const fieldOrder = [
    "version",
    "id",
    "kind",
    "name",
    "prompt",
    "status",
    "rrule",
    "model",
    "engine",
    "reasoning_effort",
    "execution_environment",
    "target_thread_id",
    "cwds",
    "last_run_at",
    "created_at",
    "updated_at",
  ]

  for (const key of fieldOrder) {
    const value = automation[key]
    if (value !== undefined && value !== null) ordered[key] = value
  }
  for (const [key, value] of Object.entries(automation)) {
    if (!(key in ordered) && value !== undefined && value !== null) {
      ordered[key] = value
    }
  }
  return ordered
}

function inferAutomationKind(input: AutomationInput): string {
  return asString(input.targetThreadId) || asString(input.target_thread_id)
    ? "heartbeat"
    : "cron"
}

function requireAutomationId(input: AutomationInput): string {
  const id = asString(input.id) || asString(input.automationId)
  if (!id || !AUTOMATION_ID_PATTERN.test(id)) {
    throw new Error(`Invalid automation id: ${id ?? ""}`)
  }
  return id
}

function getAutomationTime(automation: Record<string, unknown>): number {
  const value =
    automation.updated_at ??
    automation.updatedAt ??
    automation.created_at ??
    automation.createdAt
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

function normalizeAutomationEngine(
  input: AutomationInput,
  model: string,
): LocalAutomationEngineId {
  const rawEngine =
    asString(input.engine) ||
    asString(input.agentEngineId) ||
    asString(input.agent_engine_id) ||
    asString(input.runtimeEngine) ||
    asString(input.runtime_engine)
  if (isLocalAutomationEngineId(rawEngine)) return rawEngine

  const normalizedModel = model.trim().toLowerCase()
  if (
    normalizedModel.includes("claude") ||
    normalizedModel.includes("sonnet") ||
    normalizedModel.includes("opus")
  ) {
    return "claude-code"
  }
  if (normalizedModel.startsWith("gpt-") || normalizedModel.includes("codex")) {
    return "codex"
  }
  if (normalizedModel.includes("custom-acp")) {
    return "custom-acp"
  }
  return "hermes"
}

function isLocalAutomationEngineId(
  value: string | null,
): value is LocalAutomationEngineId {
  return AUTOMATION_ENGINE_IDS.includes(value as LocalAutomationEngineId)
}

function copyStringField(
  input: AutomationInput,
  output: Record<string, unknown>,
  field: string,
): void {
  const value = asString(input[field])
  if (value) output[field] = value
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

function expandHome(input: string): string {
  if (input === "~") return homedir()
  if (input.startsWith("~/")) return join(homedir(), input.slice(2))
  return input
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}
