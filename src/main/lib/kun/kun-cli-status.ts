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
  type KunCliSettingsOptions,
  readKunCliSettings,
  writeKunCliSettings,
} from "./kun-cli-settings"

const execFileAsync = promisify(execFile)

const KUN_INSTALL_HINT =
  "Install the bring-your-own Kun CLI, then set the absolute Kun executable path in Settings."
const KUN_DOCS_URL = "https://github.com/DeepSeek-GUI/DeepSeek-GUI"
const KUN_INSTALL_COMMAND = "Install Kun from the upstream project."
const KUN_AUTH_HINT =
  "Configure Kun with an isolated provider profile before enabling runs."

type KunCliSource = "override" | "path" | "unresolved"

type KunCliAvailability =
  | "missing"
  | "invalid-path"
  | "non-executable"
  | "version-probe-failed"
  | "available"
  | "disabled"

type KunCliBlockerCode =
  | "kun-runtime-disabled"
  | "kun-cli-missing"
  | "kun-cli-invalid-path"
  | "kun-cli-not-executable"

export type KunCliVersionStatus = {
  ok: boolean
  value: string | null
  error: string | null
}

export type KunCliSetupStatus = {
  runtimeId: "kun"
  label: "Kun"
  ok: boolean
  availability: KunCliAvailability
  source: KunCliSource
  executable: RuntimeExecutableStatus
  version: KunCliVersionStatus
  blocker: {
    component: "kun-cli"
    code: KunCliBlockerCode
    message: string
    hint: string
  } | null
  guidance: {
    installCommand: string
    authHint: string
    docsUrl: string
  }
}

export type ResolvedKunCliSetupStatus = {
  status: KunCliSetupStatus
  executablePath: string | null
}

type KunCliStatusOptions = KunCliSettingsOptions & {
  env?: NodeJS.ProcessEnv
  cwd?: string | null
  overridePath?: string | null
  ignoreSavedOverride?: boolean
  enabled?: boolean
  probeVersion?: (filePath: string) => Promise<KunCliVersionStatus>
}

type KunPathCandidate = {
  source: Exclude<KunCliSource, "unresolved">
  path: string
}

function kunBinaryNames(platform = process.platform): string[] {
  return platform === "win32" ? ["kun.cmd", "kun.exe", "kun"] : ["kun"]
}

function sanitizeForRenderer(value: string | null): string | null {
  if (!value) return null
  const redacted = redactRuntimePayload(value, {
    runtimeId: "kun",
    runId: "kun-cli-setup",
    source: "runtime-diagnostic",
  }).payload
  const text = typeof redacted === "string" ? redacted : "Kun CLI diagnostic."
  return text.trim().slice(0, 500)
}

function containsSecretLikeText(value: string): boolean {
  return sanitizeForRenderer(value) !== value.trim()
}

function kunExecutableStatus(filePath: string | null): RuntimeExecutableStatus {
  const status = getRuntimeExecutableStatus(filePath, KUN_INSTALL_HINT)
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
  source: KunCliSource,
  code: KunCliBlockerCode,
  availability: KunCliAvailability,
): ResolvedKunCliSetupStatus {
  return {
    executablePath: null,
    status: {
      runtimeId: "kun",
      label: "Kun",
      ok: false,
      availability,
      source,
      executable: {
        ok: false,
        path: null,
        exists: false,
        isExecutable: false,
        error: sanitizeForRenderer(message),
        hint: KUN_INSTALL_HINT,
      },
      version: {
        ok: false,
        value: null,
        error: null,
      },
      blocker: {
        component: "kun-cli",
        code,
        message,
        hint: KUN_INSTALL_HINT,
      },
      guidance: {
        installCommand: KUN_INSTALL_COMMAND,
        authHint: KUN_AUTH_HINT,
        docsUrl: KUN_DOCS_URL,
      },
    },
  }
}

function disabledStatus(): ResolvedKunCliSetupStatus {
  return invalidStatus(
    "Kun runtime is disabled. Set LOCUS_ENABLE_KUN_RUNTIME=1 to enable Kun setup.",
    "unresolved",
    "kun-runtime-disabled",
    "disabled",
  )
}

function pathOverrideCandidate(
  rawPath: string | null,
): ResolvedKunCliSetupStatus | KunPathCandidate | null {
  if (!rawPath) return null
  const executablePath = rawPath.trim()
  if (!executablePath) return null
  if (!isAbsolute(executablePath)) {
    return invalidStatus(
      "Kun executable path must be an absolute local file path.",
      "override",
      "kun-cli-invalid-path",
      "invalid-path",
    )
  }
  if (looksLikeCommandString(executablePath)) {
    return invalidStatus(
      "Kun executable path must be a file path, not a shell command.",
      "override",
      "kun-cli-invalid-path",
      "invalid-path",
    )
  }
  if (containsSecretLikeText(executablePath)) {
    return invalidStatus(
      "Kun executable path contains secret-like text and was rejected.",
      "override",
      "kun-cli-invalid-path",
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

function discoverKunOnPath(
  env: NodeJS.ProcessEnv,
  cwd: string | null | undefined,
): KunPathCandidate | null {
  const cwdPath = cwd ? resolve(cwd) : null
  for (const entry of pathEnvValue(env).split(delimiter)) {
    const directory = entry.trim()
    if (!directory || directory === "." || !isAbsolute(directory)) continue
    if (cwdPath && isSameOrInside(directory, cwdPath)) continue

    for (const binaryName of kunBinaryNames()) {
      const candidate = join(directory, binaryName)
      if (cwdPath && isSameOrInside(candidate, cwdPath)) continue
      const status = getRuntimeExecutableStatus(candidate, KUN_INSTALL_HINT)
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

async function defaultProbeKunVersion(
  filePath: string,
): Promise<KunCliVersionStatus> {
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
      error instanceof Error ? error.message : "Kun version probe failed."
    return {
      ok: false,
      value: null,
      error: sanitizeForRenderer(message) ?? "Kun version probe failed.",
    }
  }
}

async function statusForCandidate(
  candidate: KunPathCandidate | null,
  options: KunCliStatusOptions,
): Promise<ResolvedKunCliSetupStatus> {
  if (!candidate) {
    return invalidStatus(
      "Kun CLI was not found on PATH.",
      "unresolved",
      "kun-cli-missing",
      "missing",
    )
  }

  const rawStatus = getRuntimeExecutableStatus(candidate.path, KUN_INSTALL_HINT)
  const executable = kunExecutableStatus(candidate.path)
  if (!rawStatus.ok) {
    return {
      executablePath: null,
      status: {
        runtimeId: "kun",
        label: "Kun",
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
          component: "kun-cli",
          code: rawStatus.exists
            ? "kun-cli-not-executable"
            : "kun-cli-invalid-path",
          message:
            executable.error ??
            "Kun executable path is invalid or not executable.",
          hint: KUN_INSTALL_HINT,
        },
        guidance: {
          installCommand: KUN_INSTALL_COMMAND,
          authHint: KUN_AUTH_HINT,
          docsUrl: KUN_DOCS_URL,
        },
      },
    }
  }

  const version = await (options.probeVersion ?? defaultProbeKunVersion)(
    candidate.path,
  )
  return {
    executablePath: candidate.path,
    status: {
      runtimeId: "kun",
      label: "Kun",
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
        installCommand: KUN_INSTALL_COMMAND,
        authHint: KUN_AUTH_HINT,
        docsUrl: KUN_DOCS_URL,
      },
    },
  }
}

export async function resolveKunCliSetupStatus(
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  if (options.enabled === false) {
    return disabledStatus()
  }

  const explicitOverride = options.overridePath ?? null
  const savedOverride = options.ignoreSavedOverride
    ? null
    : readKunCliSettings(options).executablePath
  const override = pathOverrideCandidate(explicitOverride ?? savedOverride)
  if (override && "status" in override) return override
  const candidate =
    override ?? discoverKunOnPath(options.env ?? process.env, options.cwd)
  return statusForCandidate(candidate, options)
}

export function toRendererKunCliSetupStatus(
  resolved: ResolvedKunCliSetupStatus,
): KunCliSetupStatus {
  return resolved.status
}

export async function saveKunExecutablePathOverride(
  executablePath: string,
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  const resolved = await resolveKunCliSetupStatus({
    ...options,
    overridePath: executablePath,
    ignoreSavedOverride: true,
  })
  if (!resolved.status.ok || !resolved.executablePath) {
    return resolved
  }
  writeKunCliSettings({ executablePath: resolved.executablePath }, options)
  return resolved
}

export async function resetKunExecutablePathOverride(
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  writeKunCliSettings({ executablePath: null }, options)
  return resolveKunCliSetupStatus({
    ...options,
    ignoreSavedOverride: true,
  })
}
