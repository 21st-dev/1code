import { app } from "electron"
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import {
  getDefaultShell,
  isWindows,
  platform
} from "../platform"

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
  const currentPlatform = process.platform
  const arch = process.arch

  // Only log verbose info on first call
  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] ========== BUNDLED BINARY PATH ==========")
    console.log("[claude-binary] isDev:", isDev)
    console.log("[claude-binary] platform:", currentPlatform)
    console.log("[claude-binary] arch:", arch)
    console.log("[claude-binary] appPath:", app.getAppPath())
  }

  // In dev: apps/desktop/resources/bin/{platform}-{arch}/claude
  // In production: {resourcesPath}/bin/claude
  const resourcesPath = isDev
    ? path.join(
        app.getAppPath(),
        "resources/bin",
        `${currentPlatform}-${arch}`
      )
    : path.join(process.resourcesPath, "bin")

  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] resourcesPath:", resourcesPath)
  }

  const binaryName = currentPlatform === "win32" ? "claude.exe" : "claude"
  const binaryPath = path.join(resourcesPath, binaryName)

  if (process.env.DEBUG_CLAUDE_BINARY) {
    console.log("[claude-binary] binaryPath:", binaryPath)
  }

  // Check if binary exists
  const exists = fs.existsSync(binaryPath)

  // Always log if binary doesn't exist (critical error)
  if (!exists) {
    console.error(
      "[claude-binary] WARNING: Binary not found at path:",
      binaryPath
    )
    console.error(
      "[claude-binary] Run 'bun run claude:download' to download it"
    )
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

/**
 * Strip sensitive keys from environment
 */
function stripSensitiveKeys(env: Record<string, string>): void {
  for (const key of STRIPPED_ENV_KEYS) {
    if (key in env) {
      console.log(`[claude-env] Stripped ${key} from shell environment`)
      delete env[key]
    }
  }
}

/**
 * Load Claude Code CLI settings from disk (~/.claude/settings.json)
 * This is needed because some users configure Claude Code via 'claude config'
 * which writes to this file, and these settings might not be in the shell env.
 */
function loadClaudeCliSettings(): Record<string, string> {
  try {
    const homeDir = os.homedir()
    const settingsPath = path.join(homeDir, ".claude", "settings.json")
    
    console.log(`[claude-env] Looking for settings at: ${settingsPath}`)
    
    if (!fs.existsSync(settingsPath)) {
      console.log(`[claude-env] No settings.json found at ${settingsPath}`)
      return {}
    }

    const content = fs.readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(content)
    
    // Config values are stored in the 'env' object within settings.json
    if (settings && typeof settings === 'object' && settings.env && typeof settings.env === 'object') {
      console.log(`[claude-env] Loaded ${Object.keys(settings.env).length} vars from ${settingsPath}`)
      console.log(`[claude-env] Detected keys: ${Object.keys(settings.env).join(', ')}`)
      return settings.env as Record<string, string>
    } else {
      console.log(`[claude-env] settings.json found but no 'env' object inside`)
    }
  } catch (error) {
    console.warn("[claude-env] Failed to load settings.json:", error)
  }
  
  return {}
}

/**
 * Load full shell environment.
 * - Windows: Derives PATH from process.env + common install locations (no shell spawn)
 * - macOS/Linux: Spawns interactive login shell to capture PATH from shell profiles
 * Results are cached for the lifetime of the process.
 */
export function getClaudeShellEnvironment(): Record<string, string> {
  if (cachedShellEnv !== null) {
    return { ...cachedShellEnv }
  }

  let env: Record<string, string> = {}

  // 1. Load settings from ~/.claude/settings.json
  // These are the lowest priority of the "external" configs, but higher than defaults.
  // We start with these, then overlay shell env on top.
  const fileSettings = loadClaudeCliSettings()
  Object.assign(env, fileSettings)

  // 2. Load shell environment
  if (isWindows()) {
    console.log(
      "[claude-env] Windows detected, deriving PATH without shell invocation"
    )

    // Use platform provider to build environment
    const platformEnv = platform.buildEnvironment()
    stripSensitiveKeys(platformEnv)
    
    Object.assign(env, platformEnv)

    console.log(
      `[claude-env] Built Windows environment with ${Object.keys(env).length} vars`
    )
  } else {
    // macOS/Linux: spawn interactive login shell to get full environment
    const shell = getDefaultShell()
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

      const shellEnv = parseEnvOutput(output)
      stripSensitiveKeys(shellEnv)

      console.log(
        `[claude-env] Loaded ${Object.keys(shellEnv).length} environment variables from shell`
      )
      
      // Overlay shell env on top of file settings
      Object.assign(env, shellEnv)
    } catch (error) {
      console.error("[claude-env] Failed to load shell environment:", error)

      // Fallback: use platform provider
      const platformEnv = platform.buildEnvironment()
      stripSensitiveKeys(platformEnv)

      console.log("[claude-env] Using fallback environment from platform provider")
      Object.assign(env, platformEnv)
    }
  }

  // Log detected config for debugging
  console.log(`[claude-env] Final config detection:`)
  console.log(`  - ANTHROPIC_API_KEY: ${env.ANTHROPIC_API_KEY ? '***' : 'not set'}`)
  console.log(`  - ANTHROPIC_AUTH_TOKEN: ${env.ANTHROPIC_AUTH_TOKEN ? '***' : 'not set'}`)
  console.log(`  - ANTHROPIC_BASE_URL: ${env.ANTHROPIC_BASE_URL || 'not set'}`)
  console.log(`  - ANTHROPIC_MODEL: ${env.ANTHROPIC_MODEL || 'not set'}`)

  // 3. Cache and return
  cachedShellEnv = env
  return { ...env }
}

/**
 * Build the complete environment for Claude SDK.
 * Merges shell environment, process.env, and custom overrides.
 */
export function buildClaudeEnv(options?: {
  ghToken?: string
  customEnv?: Record<string, string>
  enableTasks?: boolean
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

  // 3. Ensure critical vars are present using platform provider
  const platformEnv = platform.buildEnvironment()
  if (!env.HOME) env.HOME = platformEnv.HOME
  if (!env.USER) env.USER = platformEnv.USER
  if (!env.TERM) env.TERM = "xterm-256color"
  if (!env.SHELL) env.SHELL = getDefaultShell()

  // Windows-specific: ensure USERPROFILE is set
  if (isWindows() && !env.USERPROFILE) {
    env.USERPROFILE = os.homedir()
  }

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
  // Enable/disable task management tools based on user preference (default: enabled)
  env.CLAUDE_CODE_ENABLE_TASKS = options?.enableTasks !== false ? "true" : "false"

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
  prefix: string = ""
): void {
  console.log(`${prefix}[claude-env] HOME: ${env.HOME}`)
  console.log(`${prefix}[claude-env] USER: ${env.USER}`)
  console.log(
    `${prefix}[claude-env] PATH includes homebrew: ${env.PATH?.includes("/opt/homebrew")}`
  )
  console.log(
    `${prefix}[claude-env] PATH includes /usr/local/bin: ${env.PATH?.includes("/usr/local/bin")}`
  )
  console.log(
    `${prefix}[claude-env] ANTHROPIC_AUTH_TOKEN: ${env.ANTHROPIC_AUTH_TOKEN ? "set" : "not set"}`
  )
}
