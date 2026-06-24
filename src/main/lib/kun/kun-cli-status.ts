import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs"
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
import {
  isKunManagedExecutablePath,
  type KunManagedInstallStatus,
  resolveKunManagedInstallStatus,
} from "./kun-managed-install"

const execFileAsync = promisify(execFile)

const KUN_INSTALL_HINT =
  "Install the bring-your-own Kun CLI, then set the absolute Kun executable path in Settings."
const KUN_CONFIG_HINT =
  "Set an absolute Kun config.json path that contains the provider credentials for the isolated BYO runtime."
const KUN_DOCS_URL = "https://github.com/DeepSeek-GUI/DeepSeek-GUI"
const KUN_INSTALL_COMMAND = "Install Kun from the upstream project."
const KUN_AUTH_HINT =
  "Configure Kun with a BYO config file or keep provider profiles degraded until the Locus responses gateway is wired."

type KunCliSource = "managed" | "override" | "path" | "unresolved"

type KunCliAvailability =
  | "missing"
  | "invalid-path"
  | "non-executable"
  | "version-probe-failed"
  | "config-missing"
  | "config-invalid"
  | "available"
  | "disabled"

type KunCliBlockerCode =
  | "kun-runtime-disabled"
  | "kun-cli-missing"
  | "kun-cli-invalid-path"
  | "kun-cli-not-executable"
  | "kun-config-missing"
  | "kun-config-invalid-path"
  | "kun-config-not-file"

export type KunCliVersionStatus = {
  ok: boolean
  value: string | null
  error: string | null
}

export type KunShellApprovalStatus = {
  approved: boolean
  currentHash: string | null
  approvedHash: string | null
  reason:
    | "approved"
    | "unapproved"
    | "hash-mismatch"
    | "hash-unavailable"
    | "runtime-disabled"
  error: string | null
  hint: string
}

export type KunConfigFileStatus = {
  ok: boolean
  path: string | null
  exists: boolean
  isFile: boolean
  error: string | null
  hint: string
}

export type KunCliSetupStatus = {
  runtimeId: "kun"
  label: "Kun"
  ok: boolean
  availability: KunCliAvailability
  source: KunCliSource
  executable: RuntimeExecutableStatus
  managedInstall: KunManagedInstallStatus
  config: KunConfigFileStatus
  version: KunCliVersionStatus
  shell: KunShellApprovalStatus
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
  configPath: string | null
}

type KunCliStatusOptions = KunCliSettingsOptions & {
  env?: NodeJS.ProcessEnv
  cwd?: string | null
  overridePath?: string | null
  configPathOverride?: string | null
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

function defaultKunShellApprovalStatus(
  reason: KunShellApprovalStatus["reason"],
  error: string | null = null,
): KunShellApprovalStatus {
  return {
    approved: false,
    currentHash: null,
    approvedHash: null,
    reason,
    error: sanitizeForRenderer(error),
    hint: "Approve the current Kun executable hash in Settings before enabling guarded shell.",
  }
}

function hashKunExecutableFile(filePath: string): KunShellApprovalStatus {
  try {
    const currentHash = createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex")
    return {
      approved: false,
      currentHash,
      approvedHash: null,
      reason: "unapproved",
      error: null,
      hint: "Approve the current Kun executable hash in Settings before enabling guarded shell.",
    }
  } catch (error) {
    return defaultKunShellApprovalStatus(
      "hash-unavailable",
      error instanceof Error ? error.message : String(error),
    )
  }
}

function resolveKunShellApprovalStatus(input: {
  executablePath: string | null
  approvedHash: string | null
  enabled?: boolean
}): KunShellApprovalStatus {
  if (input.enabled === false) {
    return defaultKunShellApprovalStatus("runtime-disabled")
  }
  if (!input.executablePath) {
    return defaultKunShellApprovalStatus("hash-unavailable")
  }
  const hashed = hashKunExecutableFile(input.executablePath)
  const approvedHash = input.approvedHash?.trim().toLowerCase() || null
  if (!hashed.currentHash) {
    return { ...hashed, approvedHash }
  }
  if (!approvedHash) {
    return { ...hashed, approvedHash, reason: "unapproved" }
  }
  if (approvedHash !== hashed.currentHash) {
    return {
      ...hashed,
      approvedHash,
      reason: "hash-mismatch",
      error: "Kun executable hash does not match the shell-approved hash.",
    }
  }
  return {
    ...hashed,
    approved: true,
    approvedHash,
    reason: "approved",
    error: null,
  }
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

function missingConfigStatus(): KunConfigFileStatus {
  return {
    ok: false,
    path: null,
    exists: false,
    isFile: false,
    error: "Kun config path is not configured.",
    hint: KUN_CONFIG_HINT,
  }
}

function kunConfigFileStatus(filePath: string | null): KunConfigFileStatus {
  const configPath = filePath?.trim() || null
  if (!configPath) return missingConfigStatus()
  if (!isAbsolute(configPath)) {
    return {
      ok: false,
      path: sanitizeForRenderer(configPath),
      exists: false,
      isFile: false,
      error: "Kun config path must be an absolute local file path.",
      hint: KUN_CONFIG_HINT,
    }
  }
  if (looksLikeCommandString(configPath)) {
    return {
      ok: false,
      path: null,
      exists: false,
      isFile: false,
      error: "Kun config path must be a file path, not a shell command.",
      hint: KUN_CONFIG_HINT,
    }
  }
  if (containsSecretLikeText(configPath)) {
    return {
      ok: false,
      path: null,
      exists: false,
      isFile: false,
      error: "Kun config path contains secret-like text and was rejected.",
      hint: KUN_CONFIG_HINT,
    }
  }
  if (!existsSync(configPath)) {
    return {
      ok: false,
      path: sanitizeForRenderer(configPath),
      exists: false,
      isFile: false,
      error: "Kun config file was not found.",
      hint: KUN_CONFIG_HINT,
    }
  }
  try {
    const stats = statSync(configPath)
    if (!stats.isFile()) {
      return {
        ok: false,
        path: sanitizeForRenderer(configPath),
        exists: true,
        isFile: false,
        error: "Kun config path exists but is not a file.",
        hint: KUN_CONFIG_HINT,
      }
    }
    return {
      ok: true,
      path: sanitizeForRenderer(configPath),
      exists: true,
      isFile: true,
      error: null,
      hint: KUN_CONFIG_HINT,
    }
  } catch (error) {
    return {
      ok: false,
      path: sanitizeForRenderer(configPath),
      exists: true,
      isFile: false,
      error:
        sanitizeForRenderer(
          error instanceof Error ? error.message : String(error),
        ) ?? "Kun config file is not readable.",
      hint: KUN_CONFIG_HINT,
    }
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
  config: KunConfigFileStatus = missingConfigStatus(),
  managedInstall: KunManagedInstallStatus = resolveKunManagedInstallStatus(),
): ResolvedKunCliSetupStatus {
  return {
    executablePath: null,
    configPath: null,
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
      managedInstall,
      config,
      version: {
        ok: false,
        value: null,
        error: null,
      },
      shell: defaultKunShellApprovalStatus(
        availability === "disabled" ? "runtime-disabled" : "hash-unavailable",
      ),
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

function disabledStatus(
  managedInstall: KunManagedInstallStatus,
): ResolvedKunCliSetupStatus {
  return invalidStatus(
    "Kun runtime is disabled. Set LOCUS_ENABLE_KUN_RUNTIME=1 to enable Kun setup.",
    "unresolved",
    "kun-runtime-disabled",
    "disabled",
    missingConfigStatus(),
    managedInstall,
  )
}

function pathOverrideCandidate(
  rawPath: string | null,
  source: Exclude<KunCliSource, "path" | "unresolved"> = "override",
): ResolvedKunCliSetupStatus | KunPathCandidate | null {
  if (!rawPath) return null
  const executablePath = rawPath.trim()
  if (!executablePath) return null
  if (!isAbsolute(executablePath)) {
    return invalidStatus(
      "Kun executable path must be an absolute local file path.",
      source,
      "kun-cli-invalid-path",
      "invalid-path",
    )
  }
  if (looksLikeCommandString(executablePath)) {
    return invalidStatus(
      "Kun executable path must be a file path, not a shell command.",
      source,
      "kun-cli-invalid-path",
      "invalid-path",
    )
  }
  if (containsSecretLikeText(executablePath)) {
    return invalidStatus(
      "Kun executable path contains secret-like text and was rejected.",
      source,
      "kun-cli-invalid-path",
      "invalid-path",
    )
  }
  return {
    source,
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
    try {
      await execFileAsync(filePath, ["help"], {
        encoding: "utf8",
        timeout: 3000,
        maxBuffer: 8192,
        shell: false,
        windowsHide: true,
      })
      return {
        ok: true,
        value: "Kun CLI detected (version unavailable)",
        error: null,
      }
    } catch {
      const message =
        error instanceof Error ? error.message : "Kun version probe failed."
      return {
        ok: false,
        value: null,
        error: sanitizeForRenderer(message) ?? "Kun version probe failed.",
      }
    }
  }
}

async function statusForCandidate(
  candidate: KunPathCandidate | null,
  options: KunCliStatusOptions,
  configPath: string | null,
  approvedShellHash: string | null,
): Promise<ResolvedKunCliSetupStatus> {
  const managedInstall = resolveKunManagedInstallStatus(options)
  const config = kunConfigFileStatus(configPath)
  if (!candidate) {
    return invalidStatus(
      "Kun CLI was not found on PATH.",
      "unresolved",
      "kun-cli-missing",
      "missing",
      config,
      managedInstall,
    )
  }

  const rawStatus = getRuntimeExecutableStatus(candidate.path, KUN_INSTALL_HINT)
  const executable = kunExecutableStatus(candidate.path)
  const shell = rawStatus.ok
    ? resolveKunShellApprovalStatus({
        executablePath: candidate.path,
        approvedHash: approvedShellHash,
        enabled: options.enabled,
      })
    : defaultKunShellApprovalStatus("hash-unavailable")
  if (!rawStatus.ok) {
    return {
      executablePath: null,
      configPath: config.ok ? configPath : null,
      status: {
        runtimeId: "kun",
        label: "Kun",
        ok: false,
        availability: rawStatus.exists ? "non-executable" : "invalid-path",
        source: candidate.source,
        executable,
        managedInstall,
        config,
        version: {
          ok: false,
          value: null,
          error: null,
        },
        shell,
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
  const ok = config.ok
  const blocker: KunCliSetupStatus["blocker"] = config.ok
    ? null
    : {
        component: "kun-cli" as const,
        code: config.exists
          ? config.isFile
            ? "kun-config-invalid-path"
            : "kun-config-not-file"
          : config.path
            ? "kun-config-invalid-path"
            : "kun-config-missing",
        message:
          config.error ?? "Kun config path must be configured before Kun runs.",
        hint: KUN_CONFIG_HINT,
      }
  return {
    executablePath: candidate.path,
    configPath: config.ok ? configPath : null,
    status: {
      runtimeId: "kun",
      label: "Kun",
      ok,
      availability: !version.ok
        ? "version-probe-failed"
        : config.ok
          ? "available"
          : config.path
            ? "config-invalid"
            : "config-missing",
      source: candidate.source,
      executable,
      managedInstall,
      config,
      version: {
        ok: version.ok,
        value: sanitizeForRenderer(version.value),
        error: sanitizeForRenderer(version.error),
      },
      shell,
      blocker,
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
  const managedInstall = resolveKunManagedInstallStatus(options)
  if (options.enabled === false) {
    return disabledStatus(managedInstall)
  }

  const savedSettings = options.ignoreSavedOverride
    ? {
        executablePath: null,
        configPath: null,
        shellApprovedExecutableHash: null,
      }
    : readKunCliSettings(options)
  const explicitOverride = options.overridePath ?? null
  const savedOverride = savedSettings.executablePath
  const configPath = options.configPathOverride ?? savedSettings.configPath
  const override = explicitOverride
    ? pathOverrideCandidate(explicitOverride, "override")
    : pathOverrideCandidate(
        savedOverride,
        isKunManagedExecutablePath(savedOverride, options)
          ? "managed"
          : "override",
      )
  if (override && "status" in override) return override
  const candidate =
    override ?? discoverKunOnPath(options.env ?? process.env, options.cwd)
  return statusForCandidate(
    candidate,
    options,
    configPath,
    savedSettings.shellApprovedExecutableHash,
  )
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
    if (!resolved.executablePath) return resolved
  }
  if (resolved.executablePath) {
    const current = readKunCliSettings(options)
    writeKunCliSettings(
      {
        executablePath: resolved.executablePath,
        configPath: current.configPath,
        shellApprovedExecutableHash:
          current.executablePath === resolved.executablePath
            ? current.shellApprovedExecutableHash
            : null,
      },
      options,
    )
  }
  return resolveKunCliSetupStatus(options)
}

export async function saveKunConfigPathOverride(
  configPath: string,
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  const config = kunConfigFileStatus(configPath)
  if (!config.ok || !config.path) {
    const current = await resolveKunCliSetupStatus({
      ...options,
      configPathOverride: configPath,
    })
    return current
  }
  const current = readKunCliSettings(options)
  writeKunCliSettings(
    {
      executablePath: current.executablePath,
      configPath,
      shellApprovedExecutableHash: current.shellApprovedExecutableHash,
    },
    options,
  )
  return resolveKunCliSetupStatus(options)
}

export async function resetKunConfigPathOverride(
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  const current = readKunCliSettings(options)
  writeKunCliSettings(
    {
      executablePath: current.executablePath,
      configPath: null,
      shellApprovedExecutableHash: current.shellApprovedExecutableHash,
    },
    options,
  )
  return resolveKunCliSetupStatus(options)
}

export async function resetKunExecutablePathOverride(
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  const current = readKunCliSettings(options)
  writeKunCliSettings(
    {
      executablePath: null,
      configPath: current.configPath,
      shellApprovedExecutableHash: null,
    },
    options,
  )
  return resolveKunCliSetupStatus({
    ...options,
    ignoreSavedOverride: true,
    configPathOverride: current.configPath,
  })
}

export async function approveKunShellExecutableHash(
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  const resolved = await resolveKunCliSetupStatus(options)
  if (!resolved.executablePath || !resolved.status.executable.ok) {
    return resolved
  }
  const shell = resolveKunShellApprovalStatus({
    executablePath: resolved.executablePath,
    approvedHash: null,
    enabled: options.enabled,
  })
  if (!shell.currentHash) {
    return resolved
  }
  const current = readKunCliSettings(options)
  writeKunCliSettings(
    {
      executablePath: resolved.executablePath,
      configPath: current.configPath,
      shellApprovedExecutableHash: shell.currentHash,
    },
    options,
  )
  return resolveKunCliSetupStatus(options)
}

export async function resetKunShellExecutableHash(
  options: KunCliStatusOptions = {},
): Promise<ResolvedKunCliSetupStatus> {
  const current = readKunCliSettings(options)
  writeKunCliSettings(
    {
      executablePath: current.executablePath,
      configPath: current.configPath,
      shellApprovedExecutableHash: null,
    },
    options,
  )
  return resolveKunCliSetupStatus(options)
}
