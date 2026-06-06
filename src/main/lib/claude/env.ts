import * as electron from "electron"
import { execFile } from "node:child_process"
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
let shellEnvRefreshStarted = false

// Delimiter for parsing env output
const DELIMITER = "_CLAUDE_ENV_DELIMITER_"

// Keys to strip from inherited shell/process env. Claude auth and endpoint
// values must come from the selected Locus credential/provider path instead of
// stale host env silently overriding that selection.
const STRIPPED_ENV_KEYS_BASE = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
]

function isClaudeEnvPackaged(): boolean {
  return electron.app?.isPackaged ?? process.env.NODE_ENV === "production"
}

function getAppPath(): string {
  return electron.app?.getAppPath?.() ?? process.cwd()
}

function getStrippedEnvKeys(): string[] {
  return STRIPPED_ENV_KEYS_BASE
}

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

  const isDev = !isClaudeEnvPackaged()
  const currentPlatform = process.platform
  const arch = process.arch
  const appPath = getAppPath()

  // Always log on first call to help debug
  console.log("[claude-binary] ========== BUNDLED BINARY DEBUG ==========")
  console.log("[claude-binary] isDev:", isDev)
  console.log("[claude-binary] platform:", currentPlatform)
  console.log("[claude-binary] arch:", arch)
  console.log("[claude-binary] appPath:", appPath)

  // In dev: apps/desktop/resources/bin/{platform}-{arch}/claude
  // In production: {resourcesPath}/bin/claude
  const resourcesPath = isDev
    ? path.join(
        appPath,
        "resources/bin",
        `${currentPlatform}-${arch}`
      )
    : path.join(process.resourcesPath, "bin")

  console.log("[claude-binary] resourcesPath:", resourcesPath)

  const binaryName = currentPlatform === "win32" ? "claude.exe" : "claude"
  const binaryPath = path.join(resourcesPath, binaryName)

  console.log("[claude-binary] binaryPath:", binaryPath)

  // Check if binary exists
  const exists = fs.existsSync(binaryPath)

  if (!exists) {
    console.error(
      "[claude-binary] WARNING: Binary not found at path:",
      binaryPath
    )
    console.error(
      "[claude-binary] Run 'bun run claude:download' to download it"
    )
  } else {
    const stats = fs.statSync(binaryPath)
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1)
    const isExecutable = (stats.mode & fs.constants.X_OK) !== 0
    console.log("[claude-binary] exists:", exists)
    console.log("[claude-binary] size:", sizeMB, "MB")
    console.log("[claude-binary] isExecutable:", isExecutable)
  }
  console.log("[claude-binary] ============================================")

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
  for (const key of getStrippedEnvKeys()) {
    if (key in env) {
      console.log(`[claude-env] Stripped ${key} from shell environment`)
      delete env[key]
    }
  }
}

function getProcessEnvironment(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value
    }
  }
  return env
}

function buildFallbackShellEnvironment(): Record<string, string> {
  const env = platform.buildEnvironment(getProcessEnvironment())
  stripSensitiveKeys(env)
  return env
}

function refreshShellEnvironmentInBackground(): void {
  if (shellEnvRefreshStarted || isWindows()) return
  shellEnvRefreshStarted = true

  const shell = getDefaultShell()
  const command = `echo -n "${DELIMITER}"; env; echo -n "${DELIMITER}"; exit`
  const child = execFile(
    shell,
    ["-ilc", command],
    {
      encoding: "utf8",
      timeout: 5000,
      env: {
        // Prevent common shell framework prompts from blocking startup.
        DISABLE_AUTO_UPDATE: "true",
        DISABLE_UPDATE_PROMPT: "true",
        HOMEBREW_NO_AUTO_UPDATE: "1",
        HOME: os.homedir(),
        USER: os.userInfo().username,
        SHELL: shell,
      },
    },
    (error, stdout) => {
      if (error) {
        const code = "code" in error ? error.code : undefined
        const signal = "signal" in error ? error.signal : undefined
        const killed = "killed" in error ? error.killed : false
        const didTimeout = code === "ETIMEDOUT" || signal === "SIGTERM" || killed
        const message =
          didTimeout
            ? "login shell timed out; continuing with fallback environment"
            : error.message
        console.warn(`[claude-env] ${message}`)
        return
      }

      const env = parseEnvOutput(stdout)
      if (Object.keys(env).length === 0) {
        console.warn("[claude-env] Login shell returned no environment; keeping fallback")
        return
      }

      const mergedEnv = platform.buildEnvironment(env)
      stripSensitiveKeys(mergedEnv)
      cachedShellEnv = mergedEnv
      console.log(
        `[claude-env] Refreshed ${Object.keys(mergedEnv).length} environment variables from shell`
      )
    }
  )

  child.unref()
}

/**
 * Load full shell environment.
 * - Windows: Derives PATH from process.env + common install locations (no shell spawn)
 * - macOS/Linux: Returns process/platform env immediately, then refreshes login
 *   shell env in the background when available.
 * Results are cached for the lifetime of the process.
 */
export function getClaudeShellEnvironment(): Record<string, string> {
  if (cachedShellEnv !== null) {
    return { ...cachedShellEnv }
  }

  // Windows: use platform provider to build environment
  if (isWindows()) {
    console.log(
      "[claude-env] Windows detected, deriving PATH without shell invocation"
    )

    // Use platform provider to build environment
    const env = platform.buildEnvironment()

    // Strip sensitive keys
    stripSensitiveKeys(env)

    console.log(
      `[claude-env] Built Windows environment with ${Object.keys(env).length} vars`
    )
    cachedShellEnv = env
    return { ...env }
  }

  const env = buildFallbackShellEnvironment()
  cachedShellEnv = env
  console.log(
    `[claude-env] Using fast environment with ${Object.keys(env).length} vars`
  )
  refreshShellEnvironmentInBackground()
  return { ...env }
}

/**
 * Build the complete environment for the Claude runtime.
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

  // 2b. Strip sensitive keys again (process.env may have re-added them).
  // Explicit custom provider env is applied after this block.
  for (const key of getStrippedEnvKeys()) {
    if (key in env) {
      console.log(`[claude-env] Stripped ${key} from final environment`)
      delete env[key]
    }
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
