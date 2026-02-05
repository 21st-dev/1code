import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { join, dirname, isAbsolute } from "node:path"
import { exec } from "node:child_process"
import { promisify } from "node:util"

const execAsync = promisify(exec)

export interface WorktreeConfig {
  "setup-worktree-unix"?: string[] | string
  "setup-worktree-windows"?: string[] | string
  "setup-worktree"?: string[] | string
}

export type WorktreeConfigSource = "custom" | "cursor" | "1code" | null

export interface DetectedWorktreeConfig {
  config: WorktreeConfig | null
  path: string | null
  source: WorktreeConfigSource
}

const CURSOR_CONFIG_PATH = ".cursor/worktrees.json"
const ONECODE_CONFIG_PATH = ".1code/worktree.json"

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await readFile(filePath, "utf-8")
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

/**
 * Detect worktree config for a project
 * Priority: custom path > .cursor/worktrees.json > .1code/worktree.json
 */
export async function detectWorktreeConfig(
  projectPath: string,
  customPath?: string,
): Promise<DetectedWorktreeConfig> {
  // 1. Check custom path if provided
  if (customPath) {
    const fullPath = isAbsolute(customPath)
      ? customPath
      : join(projectPath, customPath)
    const config = await readJsonFile<WorktreeConfig>(fullPath)
    if (config) {
      return { config, path: fullPath, source: "custom" }
    }
  }

  // 2. Check .cursor/worktrees.json
  const cursorPath = join(projectPath, CURSOR_CONFIG_PATH)
  if (await fileExists(cursorPath)) {
    const config = await readJsonFile<WorktreeConfig>(cursorPath)
    if (config) {
      return { config, path: cursorPath, source: "cursor" }
    }
  }

  // 3. Check .1code/worktree.json
  const onecodePath = join(projectPath, ONECODE_CONFIG_PATH)
  if (await fileExists(onecodePath)) {
    const config = await readJsonFile<WorktreeConfig>(onecodePath)
    if (config) {
      return { config, path: onecodePath, source: "1code" }
    }
  }

  return { config: null, path: null, source: null }
}

/**
 * Get available config paths for a project
 * Returns which paths exist and can be used
 */
export async function getAvailableConfigPaths(
  projectPath: string,
): Promise<{
  cursor: { exists: boolean; path: string }
  onecode: { exists: boolean; path: string }
}> {
  const cursorPath = join(projectPath, CURSOR_CONFIG_PATH)
  const onecodePath = join(projectPath, ONECODE_CONFIG_PATH)

  return {
    cursor: {
      exists: await fileExists(cursorPath),
      path: cursorPath,
    },
    onecode: {
      exists: await fileExists(onecodePath),
      path: onecodePath,
    },
  }
}

/**
 * Save worktree config to a file
 * Creates parent directories if needed
 */
export async function saveWorktreeConfig(
  projectPath: string,
  config: WorktreeConfig,
  target: "cursor" | "1code" | string = "1code",
): Promise<{ success: boolean; path: string; error?: string }> {
  let targetPath: string

  if (target === "cursor") {
    targetPath = join(projectPath, CURSOR_CONFIG_PATH)
  } else if (target === "1code") {
    targetPath = join(projectPath, ONECODE_CONFIG_PATH)
  } else {
    // Custom path
    targetPath = isAbsolute(target) ? target : join(projectPath, target)
  }

  try {
    // Create parent directory
    await mkdir(dirname(targetPath), { recursive: true })

    // Write config
    const content = JSON.stringify(config, null, 2)
    await writeFile(targetPath, content, "utf-8")

    return { success: true, path: targetPath }
  } catch (error) {
    return {
      success: false,
      path: targetPath,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

/**
 * Get setup commands for current platform
 */
export function getSetupCommands(config: WorktreeConfig): string[] | string | null {
  // Generic setup-worktree takes priority (cross-platform)
  if (config["setup-worktree"]) {
    return config["setup-worktree"]
  }

  // Fall back to platform-specific commands
  if (process.platform === "win32") {
    return config["setup-worktree-windows"] ?? null
  }

  // Unix (darwin, linux)
  return config["setup-worktree-unix"] ?? null
}

export interface WorktreeSetupResult {
  success: boolean
  commandsRun: number
  output: string[]
  errors: string[]
}

/**
 * Execute worktree setup commands
 * Runs after worktree creation to install deps, copy envs, etc.
 */
export async function executeWorktreeSetup(
  worktreePath: string,
  mainRepoPath: string,
): Promise<WorktreeSetupResult> {
  const result: WorktreeSetupResult = {
    success: true,
    commandsRun: 0,
    output: [],
    errors: [],
  }

  // Detect config from main repo
  const detected = await detectWorktreeConfig(mainRepoPath)
  if (!detected.config) {
    result.output.push("No worktree config found, skipping setup")
    return result
  }

  // Get commands for current platform
  const commands = getSetupCommands(detected.config)
  if (!commands) {
    result.output.push("No commands for current platform")
    return result
  }

  // Normalize to array
  const commandList = Array.isArray(commands) ? commands : [commands]
  if (commandList.length === 0) {
    result.output.push("Empty command list")
    return result
  }

  console.log(`[worktree-setup] Running ${commandList.length} setup commands in ${worktreePath}`)

  // Execute each command
  for (const cmd of commandList) {
    if (!cmd.trim()) continue

    try {
      result.output.push(`$ ${cmd}`)

      const { stdout, stderr } = await execAsync(cmd, {
        cwd: worktreePath,
        env: {
          ...process.env,
          ROOT_WORKTREE_PATH: mainRepoPath,
        },
        timeout: 300_000, // 5 minutes per command
      })

      if (stdout) {
        result.output.push(stdout.trim())
      }
      if (stderr) {
        result.output.push(`[stderr] ${stderr.trim()}`)
      }

      result.commandsRun++
      console.log(`[worktree-setup] ✓ ${cmd}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      result.errors.push(errorMsg)
      result.output.push(`[error] ${errorMsg}`)
      console.error(`[worktree-setup] ✗ ${cmd}: ${errorMsg}`)
      // Continue with next command, don't fail entirely
    }
  }

  result.success = result.errors.length === 0

  console.log(
    `[worktree-setup] Completed: ${result.commandsRun}/${commandList.length} commands, ` +
    `${result.errors.length} errors`
  )

  return result
}
