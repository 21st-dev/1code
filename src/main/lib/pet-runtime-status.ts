import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

export type PetRuntimeAvailability =
  | "ready"
  | "not-configured"
  | "missing-hook"
  | "missing-runtime"
  | "window-unavailable"

export interface CodexPetDefinition {
  id: string
  displayName: string
  description: string | null
  directory: string
  petJsonPath: string
  spritesheetPath: string | null
  spritesheetExists: boolean
  selected: boolean
}

export interface PetRuntimeLogEntry {
  at: string | null
  code?: string
  event?: string
  intent?: string
  message?: string
  reason?: string
  shouldReact?: boolean
  skipped?: string
}

export interface PetRuntimeStatus {
  petsDirectory: string
  petsDirectoryExists: boolean
  configPath: string
  selectedAvatarId: string | null
  selectedPetId: string | null
  selectedPetName: string | null
  selectedSource: "custom" | "builtin-or-unknown" | "none"
  pets: CodexPetDefinition[]
  runtime: {
    directory: string
    packageJsonPath: string
    packageJsonExists: boolean
    hookScriptPath: string
    hookScriptExists: boolean
    reactScriptPath: string
    reactScriptExists: boolean
    hookLogPath: string
    hookLogExists: boolean
    availability: PetRuntimeAvailability
  }
  hook: {
    configPath: string
    configExists: boolean
    configured: boolean
    command: string | null
    statusMessage: string | null
    timeoutSeconds: number | null
    lastDecision: PetRuntimeLogEntry | null
    lastError: PetRuntimeLogEntry | null
    lastSkipped: PetRuntimeLogEntry | null
  }
  window: {
    status: "available" | "unavailable" | "unknown"
    reason: string | null
  }
}

interface PetRuntimeStatusOptions {
  homeDir?: string
  petsDirectory?: string
  configPath?: string
  hooksPath?: string
  fallbackRuntimeDirectory?: string
}

type UnknownRecord = Record<string, unknown>

function exists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath)
  } catch {
    return false
  }
}

function readText(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8")
  } catch {
    return null
  }
}

function readJson(filePath: string): unknown | null {
  const text = readText(filePath)
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function readTail(filePath: string, maxBytes = 256 * 1024): string | null {
  try {
    const stats = fs.statSync(filePath)
    const length = Math.min(stats.size, maxBytes)
    const buffer = Buffer.alloc(length)
    const fd = fs.openSync(filePath, "r")
    try {
      fs.readSync(fd, buffer, 0, length, stats.size - length)
    } finally {
      fs.closeSync(fd)
    }
    return buffer.toString("utf8")
  } catch {
    return null
  }
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function parseSelectedAvatarId(configText: string | null): string | null {
  if (!configText) return null
  const match = configText.match(/^\s*selected-avatar-id\s*=\s*["']([^"']+)["']/m)
  return match?.[1]?.trim() || null
}

function resolveSelectedPetId(selectedAvatarId: string | null): string | null {
  if (!selectedAvatarId) return null
  return selectedAvatarId.startsWith("custom:")
    ? selectedAvatarId.slice("custom:".length)
    : selectedAvatarId
}

function readPetDefinitions(
  petsDirectory: string,
  selectedPetId: string | null,
): CodexPetDefinition[] {
  if (!exists(petsDirectory)) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(petsDirectory, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(petsDirectory, entry.name)
      const petJsonPath = path.join(directory, "pet.json")
      const raw = asRecord(readJson(petJsonPath))
      if (!raw) return null

      const id = asString(raw.id) ?? entry.name
      const displayName = asString(raw.displayName) ?? id
      const description = asString(raw.description)
      const spritesheetValue = asString(raw.spritesheetPath)
      const spritesheetPath = spritesheetValue
        ? path.resolve(directory, spritesheetValue)
        : null

      return {
        id,
        displayName,
        description,
        directory,
        petJsonPath,
        spritesheetPath,
        spritesheetExists: Boolean(spritesheetPath && exists(spritesheetPath)),
        selected: selectedPetId === id,
      } satisfies CodexPetDefinition
    })
    .filter((pet): pet is CodexPetDefinition => Boolean(pet))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

function parseHookScriptPath(command: string | null): string | null {
  if (!command) return null
  const match = command.match(/\bnode\s+(['"]?)(.+?hook\.mjs)\1(?:\s|$)/)
  return match?.[2] ? path.resolve(match[2]) : null
}

function findStopHook(hooksConfig: unknown): {
  command: string | null
  statusMessage: string | null
  timeoutSeconds: number | null
} {
  const root = asRecord(hooksConfig)
  const hooks = asRecord(root?.hooks)
  const stopHooks = Array.isArray(hooks?.Stop) ? hooks.Stop : []

  for (const groupValue of stopHooks) {
    const group = asRecord(groupValue)
    const hookEntries = Array.isArray(group?.hooks) ? group.hooks : []
    for (const hookValue of hookEntries) {
      const hook = asRecord(hookValue)
      const command = asString(hook?.command)
      if (!command) continue
      if (!command.includes("codex-official-pet-runtime")) continue
      return {
        command,
        statusMessage: asString(hook?.statusMessage),
        timeoutSeconds: asNumber(hook?.timeout),
      }
    }
  }

  return {
    command: null,
    statusMessage: null,
    timeoutSeconds: null,
  }
}

function normalizeDecisionLogEntry(value: UnknownRecord): PetRuntimeLogEntry {
  const decision = asRecord(value.decision)
  return {
    at: asString(value.at),
    event: asString(value.event) ?? undefined,
    intent: asString(decision?.intent) ?? undefined,
    reason: asString(decision?.reason) ?? undefined,
    shouldReact:
      typeof decision?.shouldReact === "boolean"
        ? decision.shouldReact
        : undefined,
  }
}

function normalizeErrorLogEntry(value: UnknownRecord): PetRuntimeLogEntry {
  const error = asRecord(value.error)
  return {
    at: asString(value.at),
    code: asString(error?.code) ?? undefined,
    message: asString(error?.message) ?? undefined,
  }
}

function normalizeSkippedLogEntry(value: UnknownRecord): PetRuntimeLogEntry {
  return {
    at: asString(value.at),
    skipped: asString(value.skipped) ?? undefined,
  }
}

function parseHookLog(hookLogPath: string): {
  lastDecision: PetRuntimeLogEntry | null
  lastError: PetRuntimeLogEntry | null
  lastSkipped: PetRuntimeLogEntry | null
} {
  const text = readTail(hookLogPath)
  if (!text) {
    return {
      lastDecision: null,
      lastError: null,
      lastSkipped: null,
    }
  }

  let lastDecision: PetRuntimeLogEntry | null = null
  let lastError: PetRuntimeLogEntry | null = null
  let lastSkipped: PetRuntimeLogEntry | null = null

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const parsed = asRecord(JSON.parse(line))
      if (!parsed) continue
      if (asRecord(parsed.decision)) {
        lastDecision = normalizeDecisionLogEntry(parsed)
      }
      if (asRecord(parsed.error)) {
        lastError = normalizeErrorLogEntry(parsed)
      }
      if (asString(parsed.skipped)) {
        lastSkipped = normalizeSkippedLogEntry(parsed)
      }
    } catch {
      continue
    }
  }

  return {
    lastDecision,
    lastError,
    lastSkipped,
  }
}

function resolveRuntimeDirectory(
  hookScriptPath: string | null,
  fallbackRuntimeDirectory: string,
): string {
  if (hookScriptPath) return path.dirname(path.dirname(hookScriptPath))
  return fallbackRuntimeDirectory
}

function computeAvailability(input: {
  hookConfigured: boolean
  hookScriptExists: boolean
  packageJsonExists: boolean
  reactScriptExists: boolean
  lastError: PetRuntimeLogEntry | null
}): PetRuntimeAvailability {
  if (!input.hookConfigured) return "not-configured"
  if (!input.hookScriptExists) return "missing-hook"
  if (!input.packageJsonExists || !input.reactScriptExists) {
    return "missing-runtime"
  }
  if (input.lastError?.code === "PET_WINDOW_NOT_FOUND") {
    return "window-unavailable"
  }
  return "ready"
}

export function readPetRuntimeStatus(
  options: PetRuntimeStatusOptions = {},
): PetRuntimeStatus {
  const homeDir = options.homeDir ?? os.homedir()
  const petsDirectory =
    options.petsDirectory ?? path.join(homeDir, ".codex", "pets")
  const configPath = options.configPath ?? path.join(homeDir, ".codex", "config.toml")
  const hooksPath = options.hooksPath ?? path.join(homeDir, ".codex", "hooks.json")
  const fallbackRuntimeDirectory =
    options.fallbackRuntimeDirectory ??
    path.join(homeDir, "Codex", "tools", "codex-official-pet-runtime")

  const selectedAvatarId = parseSelectedAvatarId(readText(configPath))
  const selectedPetId = resolveSelectedPetId(selectedAvatarId)
  const pets = readPetDefinitions(petsDirectory, selectedPetId)
  const selectedPet = pets.find((pet) => pet.selected) ?? null
  const selectedPetName = selectedPet?.displayName ?? selectedAvatarId ?? null
  const selectedSource: PetRuntimeStatus["selectedSource"] = selectedPet
    ? "custom"
    : selectedAvatarId
      ? "builtin-or-unknown"
      : "none"

  const hookInfo = findStopHook(readJson(hooksPath))
  const hookScriptPath = parseHookScriptPath(hookInfo.command)
  const runtimeDirectory = resolveRuntimeDirectory(
    hookScriptPath,
    fallbackRuntimeDirectory,
  )
  const packageJsonPath = path.join(runtimeDirectory, "package.json")
  const reactScriptPath = path.join(runtimeDirectory, "src", "react.mjs")
  const resolvedHookScriptPath =
    hookScriptPath ?? path.join(runtimeDirectory, "src", "hook.mjs")
  const hookLogPath = path.join(runtimeDirectory, "hook.log")
  const hookLog = parseHookLog(hookLogPath)

  const hookConfigured = Boolean(hookInfo.command && hookScriptPath)
  const hookScriptExists = exists(resolvedHookScriptPath)
  const packageJsonExists = exists(packageJsonPath)
  const reactScriptExists = exists(reactScriptPath)
  const availability = computeAvailability({
    hookConfigured,
    hookScriptExists,
    packageJsonExists,
    reactScriptExists,
    lastError: hookLog.lastError,
  })

  return {
    petsDirectory,
    petsDirectoryExists: exists(petsDirectory),
    configPath,
    selectedAvatarId,
    selectedPetId,
    selectedPetName,
    selectedSource,
    pets,
    runtime: {
      directory: runtimeDirectory,
      packageJsonPath,
      packageJsonExists,
      hookScriptPath: resolvedHookScriptPath,
      hookScriptExists,
      reactScriptPath,
      reactScriptExists,
      hookLogPath,
      hookLogExists: exists(hookLogPath),
      availability,
    },
    hook: {
      configPath: hooksPath,
      configExists: exists(hooksPath),
      configured: hookConfigured,
      command: hookInfo.command,
      statusMessage: hookInfo.statusMessage,
      timeoutSeconds: hookInfo.timeoutSeconds,
      lastDecision: hookLog.lastDecision,
      lastError: hookLog.lastError,
      lastSkipped: hookLog.lastSkipped,
    },
    window: {
      status:
        hookLog.lastError?.code === "PET_WINDOW_NOT_FOUND"
          ? "unavailable"
          : "unknown",
      reason: hookLog.lastError?.message ?? null,
    },
  }
}
