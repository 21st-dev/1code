import { execFile } from "node:child_process"
import { realpathSync } from "node:fs"
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
}

export type ResolvedQwenCliSetupStatus = {
  status: QwenCliSetupStatus
  executablePath: string | null
}

type QwenCliStatusOptions = QwenCliSettingsOptions & {
  env?: NodeJS.ProcessEnv
  cwd?: string | null
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

function containsSecretLikeText(value: string): boolean {
  return sanitizeForRenderer(value) !== value.trim()
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
    },
  }
}

function disabledStatus(): ResolvedQwenCliSetupStatus {
  return invalidStatus(
    "Qwen Code runtime is disabled. Set LOCUS_ENABLE_QWEN_CODE_RUNTIME=1 to enable Qwen setup.",
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
    },
  }
}

export async function resolveQwenCliSetupStatus(
  options: QwenCliStatusOptions = {},
): Promise<ResolvedQwenCliSetupStatus> {
  if (options.enabled === false) {
    return disabledStatus()
  }

  const explicitOverride = options.overridePath ?? null
  const savedOverride = options.ignoreSavedOverride
    ? null
    : readQwenCliSettings(options).executablePath
  const override = pathOverrideCandidate(explicitOverride ?? savedOverride)
  if (override && "status" in override) return override
  const candidate =
    override ?? discoverQwenOnPath(options.env ?? process.env, options.cwd)
  return statusForCandidate(candidate, options)
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
