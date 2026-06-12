import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"

type EnvSource = Record<string, string | undefined>

export const CODEX_APP_SERVER_SHELL_SNAPSHOT_SECRET_ENV_NAMES = [
  "LOCUS_CODEX_PROVIDER_GATEWAY_TOKEN",
  "CODEX_API_KEY",
] as const

export type CodexAppServerShellSnapshotSecret = {
  envName: string
  value?: string | null
}

export type CodexAppServerShellSnapshotScrubResult = {
  snapshotDir: string | null
  scannedFiles: number
  scrubbedFiles: number
  removedEnvLines: number
  redactedValueOccurrences: number
  skippedFiles: number
  errors: number
}

export class CodexAppServerShellSnapshotScrubError extends Error {
  constructor(
    readonly result: CodexAppServerShellSnapshotScrubResult,
    readonly phase: "pre-start" | "post-run",
  ) {
    super(
      `Codex app-server shell snapshot scrub failed during ${phase}: ${result.errors} error(s).`,
    )
    this.name = "CodexAppServerShellSnapshotScrubError"
  }
}

const MAX_SHELL_SNAPSHOT_BYTES = 5 * 1024 * 1024
const REDACTED_SHELL_SNAPSHOT_SECRET = "<redacted:locus-codex-secret>"

function trimmed(value: string | undefined | null): string | null {
  const next = value?.trim()
  return next ? next : null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeSecrets(
  runtimeEnv: EnvSource,
  secrets?: CodexAppServerShellSnapshotSecret[],
): CodexAppServerShellSnapshotSecret[] {
  const input =
    secrets ??
    CODEX_APP_SERVER_SHELL_SNAPSHOT_SECRET_ENV_NAMES.map((envName) => ({
      envName,
      value: runtimeEnv[envName],
    }))

  const seen = new Set<string>()
  const normalized: CodexAppServerShellSnapshotSecret[] = []
  for (const secret of input) {
    const envName = trimmed(secret.envName)
    if (!envName || seen.has(envName)) continue
    const value = trimmed(secret.value ?? runtimeEnv[envName])
    if (!value && !(envName in runtimeEnv)) continue
    seen.add(envName)
    normalized.push({ envName, value })
  }
  return normalized
}

export function resolveCodexAppServerShellSnapshotsDir(
  runtimeEnv: EnvSource,
): string | null {
  const explicitCodexHome = trimmed(runtimeEnv.CODEX_HOME)
  if (explicitCodexHome) return join(explicitCodexHome, "shell_snapshots")

  const home = trimmed(runtimeEnv.HOME) ?? trimmed(runtimeEnv.USERPROFILE)
  if (!home) return null
  return join(home, ".codex", "shell_snapshots")
}

export function scrubCodexAppServerShellSnapshotText(
  content: string,
  secrets: CodexAppServerShellSnapshotSecret[],
): {
  content: string
  removedEnvLines: number
  redactedValueOccurrences: number
} {
  let next = content
  let removedEnvLines = 0
  let redactedValueOccurrences = 0

  for (const secret of secrets) {
    const envName = trimmed(secret.envName)
    if (!envName) continue
    const envLinePattern = new RegExp(
      `^.*\\b${escapeRegExp(envName)}\\b.*(?:\\r?\\n|$)`,
      "gm",
    )
    next = next.replace(envLinePattern, () => {
      removedEnvLines += 1
      return ""
    })
  }

  for (const secret of secrets) {
    const value = trimmed(secret.value)
    if (!value) continue
    const valuePattern = new RegExp(escapeRegExp(value), "g")
    next = next.replace(valuePattern, () => {
      redactedValueOccurrences += 1
      return REDACTED_SHELL_SNAPSHOT_SECRET
    })
  }

  return {
    content: next,
    removedEnvLines,
    redactedValueOccurrences,
  }
}

export function scrubCodexAppServerShellSnapshots({
  runtimeEnv,
  secrets,
}: {
  runtimeEnv: EnvSource
  secrets?: CodexAppServerShellSnapshotSecret[]
}): CodexAppServerShellSnapshotScrubResult {
  const snapshotDir = resolveCodexAppServerShellSnapshotsDir(runtimeEnv)
  const result: CodexAppServerShellSnapshotScrubResult = {
    snapshotDir,
    scannedFiles: 0,
    scrubbedFiles: 0,
    removedEnvLines: 0,
    redactedValueOccurrences: 0,
    skippedFiles: 0,
    errors: 0,
  }

  const normalizedSecrets = normalizeSecrets(runtimeEnv, secrets)
  if (!snapshotDir || normalizedSecrets.length === 0 || !existsSync(snapshotDir)) {
    return result
  }

  let entries: string[]
  try {
    entries = readdirSync(snapshotDir)
  } catch {
    result.errors += 1
    return result
  }

  for (const entry of entries) {
    const filePath = join(snapshotDir, entry)
    try {
      const stat = lstatSync(filePath)
      if (!stat.isFile() || stat.size > MAX_SHELL_SNAPSHOT_BYTES) {
        result.skippedFiles += 1
        continue
      }
      const original = readFileSync(filePath, "utf8")
      result.scannedFiles += 1
      const scrubbed = scrubCodexAppServerShellSnapshotText(
        original,
        normalizedSecrets,
      )
      result.removedEnvLines += scrubbed.removedEnvLines
      result.redactedValueOccurrences += scrubbed.redactedValueOccurrences
      if (scrubbed.content !== original) {
        writeFileSync(filePath, scrubbed.content, "utf8")
        result.scrubbedFiles += 1
      }
    } catch {
      result.errors += 1
    }
  }

  return result
}

export function assertCodexAppServerShellSnapshotsScrubbed(
  result: CodexAppServerShellSnapshotScrubResult,
  phase: "pre-start" | "post-run",
): CodexAppServerShellSnapshotScrubResult {
  if (result.errors > 0) {
    throw new CodexAppServerShellSnapshotScrubError(result, phase)
  }
  return result
}
