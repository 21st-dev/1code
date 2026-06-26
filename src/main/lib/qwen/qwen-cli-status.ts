import { execFile } from "node:child_process"
import { existsSync, readFileSync, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, isAbsolute, join, relative, resolve } from "node:path"
import { promisify } from "node:util"
import { redactRuntimePayload } from "../agent-runtime/redaction"
import {
  getRuntimeExecutableStatus,
  type RuntimeExecutableStatus,
} from "../runtime-executable"
import {
  type QwenCliSettingsOptions,
  readQwenCliSettings,
  writeQwenCliSettings,
} from "./qwen-cli-settings"

const execFileAsync = promisify(execFile)

const QWEN_INSTALL_HINT =
  "Install Qwen Code CLI, run qwen, authenticate with /auth, then retry detection."
const QWEN_DOCS_URL = "https://qwenlm.github.io/qwen-code-docs/"
const QWEN_NPM_INSTALL_COMMAND = "npm install -g @qwen-code/qwen-code"
const QWEN_AUTH_HINT = "Run qwen, then use /auth inside the Qwen Code CLI."

type QwenCliSource = "override" | "path" | "unresolved"

type QwenCliAvailability =
  | "missing"
  | "invalid-path"
  | "non-executable"
  | "version-probe-failed"
  | "available"
  | "disabled"

type QwenCliBlockerCode =
  | "qwen-runtime-disabled"
  | "qwen-cli-missing"
  | "qwen-cli-invalid-path"
  | "qwen-cli-not-executable"

export type QwenCliVersionStatus = {
  ok: boolean
  value: string | null
  error: string | null
}

export type QwenCliConfigurationModel = {
  id: string
  name: string | null
  envKey: string | null
  baseUrlOrigin: string | null
}

export type QwenCliConfigurationProvider = {
  authType: string
  protocol: string | null
  modelCount: number
  models: QwenCliConfigurationModel[]
}

export type QwenCliConfigurationSummary = {
  state: "disabled" | "missing" | "invalid" | "configured"
  settingsFilePresent: boolean
  envFilePresent: boolean
  selectedAuthType: string | null
  selectedModel: string | null
  providers: QwenCliConfigurationProvider[]
  envKeysInSettings: string[]
  parseError: string | null
}

export type QwenCliSetupStatus = {
  runtimeId: "qwen-code"
  label: "Qwen Code"
  ok: boolean
  availability: QwenCliAvailability
  source: QwenCliSource
  executable: RuntimeExecutableStatus
  version: QwenCliVersionStatus
  blocker: {
    component: "qwen-cli"
    code: QwenCliBlockerCode
    message: string
    hint: string
  } | null
  guidance: {
    installCommand: string
    authHint: string
    docsUrl: string
  }
  configuration: QwenCliConfigurationSummary
}

export type ResolvedQwenCliSetupStatus = {
  status: QwenCliSetupStatus
  executablePath: string | null
}

type QwenCliStatusOptions = QwenCliSettingsOptions & {
  env?: NodeJS.ProcessEnv
  cwd?: string | null
  qwenSettingsDir?: string | null
  overridePath?: string | null
  ignoreSavedOverride?: boolean
  enabled?: boolean
  probeVersion?: (filePath: string) => Promise<QwenCliVersionStatus>
}

type QwenPathCandidate = {
  source: Exclude<QwenCliSource, "unresolved">
  path: string
}

function qwenBinaryNames(platform = process.platform): string[] {
  return platform === "win32" ? ["qwen.cmd", "qwen.exe", "qwen"] : ["qwen"]
}

function sanitizeForRenderer(value: string | null): string | null {
  if (!value) return null
  const redacted = redactRuntimePayload(value, {
    runtimeId: "qwen-code",
    runId: "qwen-cli-setup",
    source: "runtime-diagnostic",
  }).payload
  const text = typeof redacted === "string" ? redacted : "Qwen CLI diagnostic."
  return text.trim().slice(0, 500)
}

function boundedRendererString(
  value: unknown,
  maxLength = 160,
): string | null {
  if (typeof value !== "string") return null
  const sanitized = sanitizeForRenderer(value)
  if (!sanitized) return null
  return sanitized.slice(0, maxLength)
}

function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined
}

function containsSecretLikeText(value: string): boolean {
  return sanitizeForRenderer(value) !== value.trim()
}

function qwenDisabledConfiguration(): QwenCliConfigurationSummary {
  return {
    state: "disabled",
    settingsFilePresent: false,
    envFilePresent: false,
    selectedAuthType: null,
    selectedModel: null,
    providers: [],
    envKeysInSettings: [],
    parseError: null,
  }
}

function qwenUncheckedConfiguration(): QwenCliConfigurationSummary {
  return {
    ...qwenDisabledConfiguration(),
    state: "missing",
  }
}

function qwenSettingsDirectory(options: QwenCliStatusOptions): string {
  if (options.qwenSettingsDir?.trim()) {
    return resolve(options.qwenSettingsDir.trim())
  }
  const env = options.env ?? process.env
  const home = env.HOME ?? env.USERPROFILE ?? homedir()
  return join(home, ".qwen")
}

function sanitizedBaseUrlOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    return sanitizeForRenderer(`${url.protocol}//${url.host}`)
  } catch {
    return null
  }
}

function qwenSettingsParseError(message: string): string {
  const lineColumn = /\bline\s+(\d+)\s+column\s+(\d+)/i.exec(message)
  if (lineColumn) {
    return `Qwen settings.json is not valid JSON (line ${lineColumn[1]}, column ${lineColumn[2]}).`
  }
  const position = /\bposition\s+(\d+)/i.exec(message)
  if (position) {
    return `Qwen settings.json is not valid JSON (position ${position[1]}).`
  }
  return "Qwen settings.json is not valid JSON."
}

function providerModels(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return []
  if (Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  if (Array.isArray(record.models)) return record.models
  if (typeof record.id === "string" || typeof record.model === "string") {
    return [record]
  }
  return []
}

function providerProtocol(
  authType: string,
  value: unknown,
): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return boundedRendererString(authType)
  }
  return (
    boundedRendererString((value as Record<string, unknown>).protocol) ??
    boundedRendererString(authType)
  )
}

function qwenModelSummary(value: unknown): QwenCliConfigurationModel | null {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  const id = boundedRendererString(record.id ?? record.model)
  if (!id) return null
  return {
    id,
    name: boundedRendererString(record.name),
    envKey: boundedRendererString(record.envKey),
    baseUrlOrigin: sanitizedBaseUrlOrigin(record.baseUrl),
  }
}

function qwenProviderSummary(
  authType: string,
  value: unknown,
): QwenCliConfigurationProvider | null {
  const safeAuthType = boundedRendererString(authType, 80)
  if (!safeAuthType) return null
  const models = providerModels(value).map(qwenModelSummary).filter(isDefined)
  return {
    authType: safeAuthType,
    protocol: providerProtocol(safeAuthType, value),
    modelCount: models.length,
    models: models.slice(0, 6),
  }
}

function readQwenConfigurationSummary(
  options: QwenCliStatusOptions,
): QwenCliConfigurationSummary {
  const settingsDir = qwenSettingsDirectory(options)
  const settingsPath = join(settingsDir, "settings.json")
  const envPath = join(settingsDir, ".env")
  const envFilePresent = existsSync(envPath)

  if (!existsSync(settingsPath)) {
    return {
      state: "missing",
      settingsFilePresent: false,
      envFilePresent,
      selectedAuthType: null,
      selectedModel: null,
      providers: [],
      envKeysInSettings: [],
      parseError: null,
    }
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as unknown
    const record =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {}
    const security =
      record.security && typeof record.security === "object"
        ? (record.security as Record<string, unknown>)
        : {}
    const auth =
      security.auth && typeof security.auth === "object"
        ? (security.auth as Record<string, unknown>)
        : {}
    const model =
      record.model && typeof record.model === "object"
        ? (record.model as Record<string, unknown>)
        : {}
    const modelProviders =
      record.modelProviders && typeof record.modelProviders === "object"
        ? (record.modelProviders as Record<string, unknown>)
        : {}
    const envInSettings =
      record.env && typeof record.env === "object" && !Array.isArray(record.env)
        ? (record.env as Record<string, unknown>)
        : {}

    const providers = Object.entries(modelProviders)
      .map(([authType, value]) => qwenProviderSummary(authType, value))
      .filter(isDefined)
      .slice(0, 8)
    const selectedAuthType = boundedRendererString(auth.selectedType, 80)
    const selectedModel = boundedRendererString(model.name ?? record.model, 160)

    return {
      state:
        selectedAuthType || selectedModel || providers.length > 0
          ? "configured"
          : "missing",
      settingsFilePresent: true,
      envFilePresent,
      selectedAuthType,
      selectedModel,
      providers,
      envKeysInSettings: Object.keys(envInSettings)
        .map((key) => boundedRendererString(key, 80))
        .filter(isDefined)
        .slice(0, 12),
      parseError: null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to parse Qwen settings."
    return {
      state: "invalid",
      settingsFilePresent: true,
      envFilePresent,
      selectedAuthType: null,
      selectedModel: null,
      providers: [],
      envKeysInSettings: [],
      parseError: qwenSettingsParseError(message),
    }
  }
}

function withQwenConfiguration(
  resolved: ResolvedQwenCliSetupStatus,
  options: QwenCliStatusOptions,
): ResolvedQwenCliSetupStatus {
  return {
    ...resolved,
    status: {
      ...resolved.status,
      configuration: readQwenConfigurationSummary(options),
    },
  }
}

function qwenExecutableStatus(
  filePath: string | null,
): RuntimeExecutableStatus {
  const status = getRuntimeExecutableStatus(filePath, QWEN_INSTALL_HINT)
  return {
    ...status,
    path: sanitizeForRenderer(status.path),
    error: sanitizeForRenderer(status.error),
  }
}

function containmentPath(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

function isSameOrInside(childPath: string, parentPath: string): boolean {
  const child = containmentPath(childPath)
  const parent = containmentPath(parentPath)
  const childToParent = relative(parent, child)
  return (
    childToParent === "" ||
    (!!childToParent &&
      !childToParent.startsWith("..") &&
      !isAbsolute(childToParent))
  )
}

function looksLikeCommandString(value: string): boolean {
  return /[\0\r\n;&|<>`]/.test(value)
}

function invalidStatus(
  message: string,
  source: QwenCliSource,
  code: QwenCliBlockerCode,
  availability: QwenCliAvailability,
): ResolvedQwenCliSetupStatus {
  return {
    executablePath: null,
    status: {
      runtimeId: "qwen-code",
      label: "Qwen Code",
      ok: false,
      availability,
      source,
      executable: {
        ok: false,
        path: null,
        exists: false,
        isExecutable: false,
        error: sanitizeForRenderer(message),
        hint: QWEN_INSTALL_HINT,
      },
      version: {
        ok: false,
        value: null,
        error: null,
      },
      blocker: {
        component: "qwen-cli",
        code,
        message,
        hint: QWEN_INSTALL_HINT,
      },
      guidance: {
        installCommand: QWEN_NPM_INSTALL_COMMAND,
        authHint: QWEN_AUTH_HINT,
        docsUrl: QWEN_DOCS_URL,
      },
      configuration: qwenUncheckedConfiguration(),
    },
  }
}

function disabledStatus(): ResolvedQwenCliSetupStatus {
  return invalidStatus(
    "Qwen Code runtime is disabled. Enable it in Settings to configure Qwen setup.",
    "unresolved",
    "qwen-runtime-disabled",
    "disabled",
  )
}

function pathOverrideCandidate(
  rawPath: string | null,
): ResolvedQwenCliSetupStatus | QwenPathCandidate | null {
  if (!rawPath) return null
  const executablePath = rawPath.trim()
  if (!executablePath) return null
  if (!isAbsolute(executablePath)) {
    return invalidStatus(
      "Qwen executable path must be an absolute local file path.",
      "override",
      "qwen-cli-invalid-path",
      "invalid-path",
    )
  }
  if (looksLikeCommandString(executablePath)) {
    return invalidStatus(
      "Qwen executable path must be a file path, not a shell command.",
      "override",
      "qwen-cli-invalid-path",
      "invalid-path",
    )
  }
  if (containsSecretLikeText(executablePath)) {
    return invalidStatus(
      "Qwen executable path contains secret-like text and was rejected.",
      "override",
      "qwen-cli-invalid-path",
      "invalid-path",
    )
  }
  return {
    source: "override",
    path: executablePath,
  }
}

function pathEnvValue(env: NodeJS.ProcessEnv): string {
  return env.PATH ?? env.Path ?? env.path ?? ""
}

function discoverQwenOnPath(
  env: NodeJS.ProcessEnv,
  cwd: string | null | undefined,
): QwenPathCandidate | null {
  const cwdPath = cwd ? resolve(cwd) : null
  for (const entry of pathEnvValue(env).split(delimiter)) {
    const directory = entry.trim()
    if (!directory || directory === "." || !isAbsolute(directory)) continue
    if (cwdPath && isSameOrInside(directory, cwdPath)) continue

    for (const binaryName of qwenBinaryNames()) {
      const candidate = join(directory, binaryName)
      if (cwdPath && isSameOrInside(candidate, cwdPath)) continue
      const status = getRuntimeExecutableStatus(candidate, QWEN_INSTALL_HINT)
      if (status.ok) {
        return {
          source: "path",
          path: candidate,
        }
      }
    }
  }
  return null
}

async function defaultProbeQwenVersion(
  filePath: string,
): Promise<QwenCliVersionStatus> {
  try {
    const result = await execFileAsync(filePath, ["--version"], {
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 8192,
      shell: false,
      windowsHide: true,
    })
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
    return {
      ok: true,
      value:
        sanitizeForRenderer(output || "version reported") ?? "version reported",
      error: null,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Qwen version probe failed."
    return {
      ok: false,
      value: null,
      error: sanitizeForRenderer(message) ?? "Qwen version probe failed.",
    }
  }
}

async function statusForCandidate(
  candidate: QwenPathCandidate | null,
  options: QwenCliStatusOptions,
): Promise<ResolvedQwenCliSetupStatus> {
  if (!candidate) {
    return invalidStatus(
      "Qwen Code CLI was not found on PATH.",
      "unresolved",
      "qwen-cli-missing",
      "missing",
    )
  }

  const rawStatus = getRuntimeExecutableStatus(
    candidate.path,
    QWEN_INSTALL_HINT,
  )
  const executable = qwenExecutableStatus(candidate.path)
  if (!rawStatus.ok) {
    return {
      executablePath: null,
      status: {
        runtimeId: "qwen-code",
        label: "Qwen Code",
        ok: false,
        availability: rawStatus.exists ? "non-executable" : "invalid-path",
        source: candidate.source,
        executable,
        version: {
          ok: false,
          value: null,
          error: null,
        },
        blocker: {
          component: "qwen-cli",
          code: rawStatus.exists
            ? "qwen-cli-not-executable"
            : "qwen-cli-invalid-path",
          message:
            executable.error ??
            "Qwen executable path is invalid or not executable.",
          hint: QWEN_INSTALL_HINT,
        },
        guidance: {
          installCommand: QWEN_NPM_INSTALL_COMMAND,
          authHint: QWEN_AUTH_HINT,
          docsUrl: QWEN_DOCS_URL,
        },
        configuration: qwenUncheckedConfiguration(),
      },
    }
  }

  const version = await (options.probeVersion ?? defaultProbeQwenVersion)(
    candidate.path,
  )
  return {
    executablePath: candidate.path,
    status: {
      runtimeId: "qwen-code",
      label: "Qwen Code",
      ok: true,
      availability: version.ok ? "available" : "version-probe-failed",
      source: candidate.source,
      executable,
      version: {
        ok: version.ok,
        value: sanitizeForRenderer(version.value),
        error: sanitizeForRenderer(version.error),
      },
      blocker: null,
      guidance: {
        installCommand: QWEN_NPM_INSTALL_COMMAND,
        authHint: QWEN_AUTH_HINT,
        docsUrl: QWEN_DOCS_URL,
      },
      configuration: qwenUncheckedConfiguration(),
    },
  }
}

export async function resolveQwenCliSetupStatus(
  options: QwenCliStatusOptions = {},
): Promise<ResolvedQwenCliSetupStatus> {
  if (options.enabled === false) {
    const disabled = disabledStatus()
    return {
      ...disabled,
      status: {
        ...disabled.status,
        configuration: qwenDisabledConfiguration(),
      },
    }
  }

  const explicitOverride = options.overridePath ?? null
  const savedOverride = options.ignoreSavedOverride
    ? null
    : readQwenCliSettings(options).executablePath
  const override = pathOverrideCandidate(explicitOverride ?? savedOverride)
  if (override && "status" in override) {
    return withQwenConfiguration(override, options)
  }
  const candidate =
    override ?? discoverQwenOnPath(options.env ?? process.env, options.cwd)
  return withQwenConfiguration(
    await statusForCandidate(candidate, options),
    options,
  )
}

export function toRendererQwenCliSetupStatus(
  resolved: ResolvedQwenCliSetupStatus,
): QwenCliSetupStatus {
  return resolved.status
}

export async function saveQwenExecutablePathOverride(
  executablePath: string,
  options: QwenCliStatusOptions = {},
): Promise<ResolvedQwenCliSetupStatus> {
  const resolved = await resolveQwenCliSetupStatus({
    ...options,
    overridePath: executablePath,
    ignoreSavedOverride: true,
  })
  if (!resolved.status.ok || !resolved.executablePath) {
    return resolved
  }
  writeQwenCliSettings({ executablePath: resolved.executablePath }, options)
  return resolved
}

export async function resetQwenExecutablePathOverride(
  options: QwenCliStatusOptions = {},
): Promise<ResolvedQwenCliSetupStatus> {
  writeQwenCliSettings({ executablePath: null }, options)
  return resolveQwenCliSetupStatus({
    ...options,
    ignoreSavedOverride: true,
  })
}
