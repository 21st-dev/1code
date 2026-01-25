import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { app } from "electron"
import { stripVTControlCharacters } from "node:util"

// Cache the shell environment
let cachedShellEnv: Record<string, string> | null = null

// Delimiter for parsing env output
const DELIMITER = "_CLAUDE_ENV_DELIMITER_"

// Keys to strip (prevent interference from unrelated providers)
// NOTE: We intentionally keep ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL
// so users can use their existing Claude Code CLI configuration (API proxy, etc.)
// Based on PR #29 by @sa4hnd
const STRIPPED_ENV_KEYS = [
  "OPENAI_API_KEY",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
]

// Cache the bundled binary path (only compute once)
let cachedBinaryPath: string | null = null
let binaryPathComputed = false

/**
 * Get path to the bundled Claude binary.
 * Returns the path to the native Claude executable bundled with the app.
 * CACHED - only computes path once and logs verbose info on first call.
 */
export function getBundledClaudeBinaryPath(): string {
  // Return cached path if already computed
  if (binaryPathComputed) {
    return cachedBinaryPath!
  }

  const isDev = !app.isPackaged
  const platform = process.platform
  const arch = process.arch

  // Only log verbose info on first call
  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] ========== BUNDLED BINARY PATH ==========")
    console.log("[claude-binary] isDev:", isDev)
    console.log("[claude-binary] platform:", platform)
    console.log("[claude-binary] arch:", arch)
    console.log("[claude-binary] appPath:", app.getAppPath())
  }

  // In dev: apps/desktop/resources/bin/{platform}-{arch}/claude
  // In production: {resourcesPath}/bin/claude
  const resourcesPath = isDev
    ? path.join(app.getAppPath(), "resources/bin", `${platform}-${arch}`)
    : path.join(process.resourcesPath, "bin")

  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] resourcesPath:", resourcesPath)
  }

  const binaryName = platform === "win32" ? "claude.exe" : "claude"
  const binaryPath = path.join(resourcesPath, binaryName)

  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] binaryPath:", binaryPath)
  }

  // Check if binary exists
  const exists = fs.existsSync(binaryPath)

  // Always log if binary doesn't exist (critical error)
  if (!exists) {
    console.error("[claude-binary] WARNING: Binary not found at path:", binaryPath)
    console.error("[claude-binary] Run 'bun run claude:download' to download it")
  } else if (process.env.DEBUG_CLAUDE_BINARY) {
    const stats = fs.statSync(binaryPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
    const isExecutable = (stats.mode & fs.constants.X_OK) !== 0
    console.log("[claude-binary] exists:", exists)
    console.log("[claude-binary] size:", sizeMB, "MB")
    console.log("[claude-binary] isExecutable:", isExecutable)
    console.log("[claude-binary] ===========================================")
  }

  // Cache the result
  cachedBinaryPath = binaryPath
  binaryPathComputed = true

  return binaryPath
}

/**
 * Parse environment variables from shell output
 */
function parseEnvOutput(output: string): Record<string, string> {
  const envSection = output.split(DELIMITER)[1]
  if (!envSection) return {}

  const env: Record<string, string> = {}
  for (const line of stripVTControlCharacters(envSection)
    .split("\n")
    .filter(Boolean)) {
    const separatorIndex = line.indexOf("=")
    if (separatorIndex > 0) {
      const key = line.substring(0, separatorIndex)
      const value = line.substring(separatorIndex + 1)
      env[key] = value
    }
  }
  return env
}

function normalizePathForComparison(p: string): string {
  return path.resolve(p).toLowerCase().replace(/[/\\]+$/, "")
}

function buildWindowsPath(): string {
  const paths: string[] = []
  const pathSeparator = ";"

  // Start with existing PATH from process.env
  if (process.env.PATH) {
    paths.push(...process.env.PATH.split(pathSeparator).filter(Boolean))
  }

  const commonPaths: string[] = [
    path.join(os.homedir(), ".local", "bin"),
    path.join(os.homedir(), "AppData", "Roaming", "npm"),
    path.join(process.env.SystemRoot || "C:\\Windows", "System32"),
    path.join(process.env.SystemRoot || "C:\\Windows"),
  ]

  const gitPaths = [
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\Git\\bin",
    path.join(os.homedir(), "AppData", "Local", "Programs", "Git", "cmd"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "Git", "bin"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "cmd"),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "bin"),
    "C:\\Program Files (x86)\\Git\\cmd",
    "C:\\Program Files (x86)\\Git\\bin",
  ]

  for (const gitPath of gitPaths) {
    try {
      if (!gitPath || gitPath.includes("undefined")) continue
      if (fs.existsSync(gitPath)) {
        commonPaths.push(gitPath)
      }
    } catch {
      // Ignore errors checking path existence
    }
  }

  const normalizedPaths = new Set<string>()
  for (const existingPath of paths) {
    normalizedPaths.add(normalizePathForComparison(existingPath))
  }

  for (const commonPath of commonPaths) {
    const normalized = normalizePathForComparison(commonPath)
    if (!normalizedPaths.has(normalized)) {
      normalizedPaths.add(normalized)
      paths.push(path.resolve(commonPath))
    }
  }

  return paths.join(pathSeparator)
}

export function getClaudeShellEnvironment(): Record<string, string> {
  if (cachedShellEnv !== null) {
    return { ...cachedShellEnv }
  }

  if (process.platform === "win32") {
    console.log(
      "[claude-env] Windows detected, deriving PATH without shell invocation",
    )
    const env: Record<string, string> = {}

    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") {
        env[key] = value
      }
    }

    env.PATH = buildWindowsPath()
    env.HOME = os.homedir()
    env.USER = os.userInfo().username
    env.USERPROFILE = os.homedir()

    for (const key of STRIPPED_ENV_KEYS) {
      if (key in env) {
        console.log(`[claude-env] Stripped ${key} from shell environment`)
        delete env[key]
      }
    }

    console.log(
      `[claude-env] Built Windows environment with ${Object.keys(env).length} vars`,
    )
    cachedShellEnv = env
    return { ...env }
  }

  const shell = process.env.SHELL || "/bin/zsh"
  const command = `echo -n "${DELIMITER}"; env; echo -n "${DELIMITER}"; exit`

  try {
    const output = execSync(`${shell} -ilc '${command}'`, {
      encoding: "utf8",
      timeout: 5000,
      env: {
        // Prevent Oh My Zsh from blocking with auto-update prompts
        DISABLE_AUTO_UPDATE: "true",
        // Minimal env to bootstrap the shell
        HOME: os.homedir(),
        USER: os.userInfo().username,
        SHELL: shell,
      },
    })

    const env = parseEnvOutput(output)

    // Strip keys that could interfere with Claude's auth resolution
    for (const key of STRIPPED_ENV_KEYS) {
      if (key in env) {
        console.log(`[claude-env] Stripped ${key} from shell environment`)
        delete env[key]
      }
    }

    console.log(
      `[claude-env] Loaded ${Object.keys(env).length} environment variables from shell`,
    )
    cachedShellEnv = env
    return { ...env }
  } catch (error) {
    console.error("[claude-env] Failed to load shell environment:", error)

    // Fallback: return minimal required env
    const home = os.homedir()
    const fallbackPath = [
      `${home}/.local/bin`,
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].join(":")

    const fallback: Record<string, string> = {
      HOME: home,
      USER: os.userInfo().username,
      PATH: fallbackPath,
      SHELL: process.env.SHELL || "/bin/zsh",
      TERM: "xterm-256color",
    }

    console.log("[claude-env] Using fallback environment")
    cachedShellEnv = fallback
    return { ...fallback }
  }
}

/**
 * Build the complete environment for Claude SDK.
 * Merges shell environment, process.env, and custom overrides.
 */
export function buildClaudeEnv(options?: {
  ghToken?: string
  customEnv?: Record<string, string>
}): Record<string, string> {
  const env: Record<string, string> = {}

  // 1. Start with shell environment (has HOME, full PATH, etc.)
  try {
    Object.assign(env, getClaudeShellEnvironment())
  } catch (error) {
    console.error("[claude-env] Shell env failed, using process.env")
  }

  // 2. Overlay current process.env (preserves Electron-set vars)
  // BUT: Don't overwrite PATH from shell env - Electron's PATH is minimal when launched from Finder
  const shellPath = env.PATH
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  // Restore shell PATH if we had one (it contains nvm, homebrew, etc.)
  if (shellPath) {
    env.PATH = shellPath
  }

  // 3. Ensure critical vars are present
  if (!env.HOME) env.HOME = os.homedir()
  if (!env.USER) env.USER = os.userInfo().username
  if (!env.SHELL) env.SHELL = "/bin/zsh"
  if (!env.TERM) env.TERM = "xterm-256color"

  // 4. Add custom overrides
  if (options?.ghToken) {
    env.GH_TOKEN = options.ghToken
  }
  if (options?.customEnv) {
    for (const [key, value] of Object.entries(options.customEnv)) {
      if (value === "") {
        delete env[key]
      } else {
        env[key] = value
      }
    }
  }

  // 5. Mark as SDK entry
  env.CLAUDE_CODE_ENTRYPOINT = "sdk-ts"

  return env
}

/**
 * Clear cached shell environment (useful for testing)
 */
export function clearClaudeEnvCache(): void {
  cachedShellEnv = null
}

/**
 * Debug: Log key environment variables
 */
export function logClaudeEnv(
  env: Record<string, string>,
  prefix: string = "",
): void {
  console.log(`${prefix}[claude-env] HOME: ${env.HOME}`)
  console.log(`${prefix}[claude-env] USER: ${env.USER}`)
  console.log(
    `${prefix}[claude-env] PATH includes homebrew: ${env.PATH?.includes("/opt/homebrew")}`,
  )
  console.log(
    `${prefix}[claude-env] PATH includes /usr/local/bin: ${env.PATH?.includes("/usr/local/bin")}`,
  )
  console.log(
    `${prefix}[claude-env] ANTHROPIC_AUTH_TOKEN: ${env.ANTHROPIC_AUTH_TOKEN ? "set" : "not set"}`,
  )
}
