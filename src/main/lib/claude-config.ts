/**
 * Helpers for reading and writing Claude MCP configuration.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Mutex } from "async-mutex"
import { eq } from "drizzle-orm"
import { getDatabase } from "./db"
import { chats, projects } from "./db/schema"

/**
 * Mutex for protecting read-modify-write operations on ~/.claude.json
 * This prevents race conditions when multiple concurrent operations
 * (e.g., token refreshes for different MCP servers) try to update the config.
 */
const configMutex = new Mutex()
const LOCUS_CLAUDE_CONFIG_HOME_ENV = "LOCUS_CLAUDE_CONFIG_HOME"

export function getClaudeConfigHome(): string {
  const configuredHome = process.env[LOCUS_CLAUDE_CONFIG_HOME_ENV]?.trim()
  return configuredHome ? path.resolve(configuredHome) : os.homedir()
}

export function getClaudeConfigPath(): string {
  return path.join(getClaudeConfigHome(), ".claude.json")
}

export function getClaudeDirConfigPath(): string {
  return path.join(getClaudeConfigHome(), ".claude", ".claude.json")
}

export function getClaudeDirMcpPath(): string {
  return path.join(getClaudeConfigHome(), ".claude", "mcp.json")
}

export const CLAUDE_CONFIG_PATH = getClaudeConfigPath()
export const CLAUDE_DIR_CONFIG_PATH = getClaudeDirConfigPath()
export const CLAUDE_DIR_MCP_PATH = getClaudeDirMcpPath()

export interface McpServerConfig {
  command?: string
  args?: string[]
  url?: string
  authType?: "oauth" | "bearer" | "none"
  _locusPluginMcp?: LocusPluginMcpProvenance
  _locusMcpRegistry?: Record<string, unknown>
  _oauth?: {
    accessToken?: string
    refreshToken?: string
    clientId?: string
    expiresAt?: number
    tokenType?: string
    hasTokens?: boolean
  }
  [key: string]: unknown
}

export interface LocusPluginMcpProvenance {
  pluginSource: string
  pluginReviewKey: string
  serverName: string
  approvalIdentifier: string
}

export interface ProjectConfig {
  mcpServers?: Record<string, McpServerConfig>
  [key: string]: unknown
}

export interface ClaudeConfig {
  mcpServers?: Record<string, McpServerConfig> // User-scope (global) MCP servers
  projects?: Record<string, ProjectConfig>
  [key: string]: unknown
}

/**
 * Read ~/.claude.json asynchronously
 * Returns empty config if file doesn't exist or is invalid
 */
export async function readClaudeConfig(): Promise<ClaudeConfig> {
  try {
    const content = await fs.readFile(getClaudeConfigPath(), "utf-8")
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * Read ~/.claude.json synchronously
 * Returns empty config if file doesn't exist or is invalid
 */
export function readClaudeConfigSync(): ClaudeConfig {
  try {
    const content = readFileSync(getClaudeConfigPath(), "utf-8")
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * Write ~/.claude.json asynchronously
 */
export async function writeClaudeConfig(config: ClaudeConfig): Promise<void> {
  const configPath = getClaudeConfigPath()
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8")
}

/**
 * Write ~/.claude.json synchronously
 */
export function writeClaudeConfigSync(config: ClaudeConfig): void {
  const configPath = getClaudeConfigPath()
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
}

/**
 * Execute a read-modify-write operation on ~/.claude.json atomically.
 * This is the ONLY safe way to update the config when concurrent writes are possible.
 *
 * Uses a mutex to ensure that only one read-modify-write cycle happens at a time,
 * preventing race conditions where concurrent token refreshes could overwrite
 * each other's updates.
 *
 * @param updater Function that receives current config and returns updated config
 * @returns The updated config
 */
export async function updateClaudeConfigAtomic(
  updater: (config: ClaudeConfig) => ClaudeConfig | Promise<ClaudeConfig>,
): Promise<ClaudeConfig> {
  return configMutex.runExclusive(async () => {
    const config = await readClaudeConfig()
    const updatedConfig = await updater(config)
    await writeClaudeConfig(updatedConfig)
    return updatedConfig
  })
}

/**
 * Check if ~/.claude.json exists
 */
export function claudeConfigExists(): boolean {
  return existsSync(getClaudeConfigPath())
}

/**
 * Get MCP servers config for a specific project
 * Automatically resolves worktree paths to original project paths
 */
export function getProjectMcpServers(
  config: ClaudeConfig,
  projectPath: string,
): Record<string, McpServerConfig> | undefined {
  const resolvedPath =
    resolveProjectPathFromWorktree(projectPath) || projectPath
  return config.projects?.[resolvedPath]?.mcpServers
}

// Special marker for global MCP servers (not tied to a project)
export const GLOBAL_MCP_PATH = "__global__"

/**
 * Get a specific MCP server config
 * Use projectPath = GLOBAL_MCP_PATH (or null) for global MCP servers
 * Automatically resolves worktree paths to original project paths
 */
export function getMcpServerConfig(
  config: ClaudeConfig,
  projectPath: string | null,
  serverName: string,
): McpServerConfig | undefined {
  // Global MCP servers (root level mcpServers in ~/.claude.json)
  if (!projectPath || projectPath === GLOBAL_MCP_PATH) {
    return config.mcpServers?.[serverName]
  }
  // Project-specific MCP servers (resolve worktree paths)
  const resolvedPath =
    resolveProjectPathFromWorktree(projectPath) || projectPath
  return config.projects?.[resolvedPath]?.mcpServers?.[serverName]
}

/**
 * Update MCP server config (creates path if needed)
 * Use projectPath = GLOBAL_MCP_PATH (or null) for global MCP servers
 * Automatically resolves worktree paths to original project paths
 */
export function updateMcpServerConfig(
  config: ClaudeConfig,
  projectPath: string | null,
  serverName: string,
  update: Partial<McpServerConfig>,
): ClaudeConfig {
  // Global MCP servers (root level mcpServers in ~/.claude.json)
  if (!projectPath || projectPath === GLOBAL_MCP_PATH) {
    config.mcpServers = config.mcpServers || {}
    config.mcpServers[serverName] = {
      ...config.mcpServers[serverName],
      ...update,
    }
    return config
  }
  // Project-specific MCP servers (resolve worktree paths)
  const resolvedPath =
    resolveProjectPathFromWorktree(projectPath) || projectPath
  config.projects = config.projects || {}
  config.projects[resolvedPath] = config.projects[resolvedPath] || {}
  config.projects[resolvedPath].mcpServers =
    config.projects[resolvedPath].mcpServers || {}
  config.projects[resolvedPath].mcpServers[serverName] = {
    ...config.projects[resolvedPath].mcpServers[serverName],
    ...update,
  }
  return config
}

export function getLocusPluginMcpProvenance(
  config: McpServerConfig | undefined,
): LocusPluginMcpProvenance | undefined {
  const provenance = config?._locusPluginMcp
  if (!provenance || typeof provenance !== "object") return undefined
  const candidate = provenance as unknown as Record<string, unknown>
  if (
    typeof candidate.pluginSource !== "string" ||
    typeof candidate.pluginReviewKey !== "string" ||
    typeof candidate.serverName !== "string" ||
    typeof candidate.approvalIdentifier !== "string"
  ) {
    return undefined
  }
  return {
    pluginSource: candidate.pluginSource,
    pluginReviewKey: candidate.pluginReviewKey,
    serverName: candidate.serverName,
    approvalIdentifier: candidate.approvalIdentifier,
  }
}

export function isLocusPluginMcpServerConfig(
  config: McpServerConfig | undefined,
): boolean {
  return Boolean(getLocusPluginMcpProvenance(config))
}

export function filterLocusPluginMcpServers(
  servers: Record<string, McpServerConfig>,
): Record<string, McpServerConfig> {
  return Object.fromEntries(
    Object.entries(servers).filter(
      ([, config]) => !isLocusPluginMcpServerConfig(config),
    ),
  )
}

export function getMatchingLocusPluginMcpServerConfig(input: {
  servers: Record<string, McpServerConfig> | undefined
  serverName: string
  pluginSource: string
  pluginReviewKey: string
  approvalIdentifier: string
}): McpServerConfig | undefined {
  const config = input.servers?.[input.serverName]
  const provenance = getLocusPluginMcpProvenance(config)
  if (!provenance) return undefined
  if (
    provenance.pluginSource !== input.pluginSource ||
    provenance.pluginReviewKey !== input.pluginReviewKey ||
    provenance.serverName !== input.serverName ||
    provenance.approvalIdentifier !== input.approvalIdentifier
  ) {
    return undefined
  }
  return config
}

/**
 * Remove an MCP server from config
 * Use projectPath = GLOBAL_MCP_PATH (or null) for global MCP servers
 * Automatically resolves worktree paths to original project paths
 */
export function removeMcpServerConfig(
  config: ClaudeConfig,
  projectPath: string | null,
  serverName: string,
): ClaudeConfig {
  // Global MCP servers
  if (!projectPath || projectPath === GLOBAL_MCP_PATH) {
    if (config.mcpServers?.[serverName]) {
      delete config.mcpServers[serverName]
    }
    return config
  }
  // Project-specific MCP servers
  const resolvedPath =
    resolveProjectPathFromWorktree(projectPath) || projectPath
  if (config.projects?.[resolvedPath]?.mcpServers?.[serverName]) {
    delete config.projects[resolvedPath].mcpServers[serverName]
    // Clean up empty objects
    if (Object.keys(config.projects[resolvedPath].mcpServers).length === 0) {
      delete config.projects[resolvedPath].mcpServers
    }
    if (Object.keys(config.projects[resolvedPath]).length === 0) {
      delete config.projects[resolvedPath]
    }
  }
  return config
}

/**
 * Resolve original project path from a worktree path.
 * Supports legacy (~/.21st/worktrees/{projectId}/{chatId}/) and
 * new format (~/.21st/worktrees/{projectName}/{worktreeFolder}/).
 *
 * @param pathToResolve - Either a worktree path or regular project path
 * @returns The original project path, or the input if not a worktree, or null if resolution fails
 */
export function resolveProjectPathFromWorktree(
  pathToResolve: string,
): string | null {
  const worktreeMarker = path.join(".21st", "worktrees")

  // Normalize for cross-platform (handle both / and \ separators)
  const normalizedPath = pathToResolve.replace(/\\/g, "/")
  const normalizedMarker = worktreeMarker.replace(/\\/g, "/")

  if (!normalizedPath.includes(normalizedMarker)) {
    // Not a worktree path, return as-is
    return pathToResolve
  }

  try {
    // Extract segments from path structure
    // Path format: /Users/.../.21st/worktrees/{projectSlug}/{worktreeFolder}
    const worktreeBase = path.join(os.homedir(), ".21st", "worktrees")
    const normalizedBase = worktreeBase.replace(/\\/g, "/")
    const relativePath = normalizedPath
      .replace(normalizedBase, "")
      .replace(/^\//, "")

    const parts = relativePath.split("/")
    if (parts.length < 1 || !parts[0]) {
      return null
    }

    const db = getDatabase()

    // Strategy 1: Legacy lookup - folder name is a projectId
    const projectById = db
      .select({ path: projects.path })
      .from(projects)
      .where(eq(projects.id, parts[0]))
      .get()

    if (projectById) {
      return projectById.path
    }

    // Strategy 2: New format - folder name is the project name.
    // Look up via chats.worktreePath which stores the full path.
    if (parts.length >= 2) {
      const expectedWorktreePath = path.join(worktreeBase, parts[0], parts[1])
      const chat = db
        .select({ projectId: chats.projectId })
        .from(chats)
        .where(eq(chats.worktreePath, expectedWorktreePath))
        .get()

      if (chat?.projectId) {
        const project = db
          .select({ path: projects.path })
          .from(projects)
          .where(eq(projects.id, chat.projectId))
          .get()

        if (project) {
          return project.path
        }
      }
    }

    return null
  } catch (error) {
    console.error("[worktree-utils] Failed to resolve project path:", error)
    return null
  }
}

// ============================================================================
// Additional MCP config sources (matching Claude Code CLI behavior)
// Sources: .mcp.json (project), ~/.claude/.claude.json, ~/.claude/mcp.json
// ============================================================================

/**
 * Expand environment variables in a string.
 * Supports ${VAR} and ${VAR:-default} syntax, matching Claude Code CLI behavior.
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const defaultSep = expr.indexOf(":-")
    if (defaultSep !== -1) {
      const varName = expr.slice(0, defaultSep)
      const defaultVal = expr.slice(defaultSep + 2)
      return process.env[varName] || defaultVal
    }
    return process.env[expr] || ""
  })
}

/**
 * Expand env vars in MCP server config fields: command, args, env, url, headers
 */
function expandMcpServerEnvVars(
  servers: Record<string, McpServerConfig>,
): Record<string, McpServerConfig> {
  const result: Record<string, McpServerConfig> = {}
  for (const [name, config] of Object.entries(servers)) {
    const expanded: McpServerConfig = { ...config }
    if (typeof expanded.command === "string") {
      expanded.command = expandEnvVars(expanded.command)
    }
    if (Array.isArray(expanded.args)) {
      expanded.args = expanded.args.map((a) =>
        typeof a === "string" ? expandEnvVars(a) : a,
      )
    }
    if (typeof expanded.url === "string") {
      expanded.url = expandEnvVars(expanded.url)
    }
    if (expanded.env && typeof expanded.env === "object") {
      const envObj = expanded.env as Record<string, string>
      const expandedEnv: Record<string, string> = {}
      for (const [k, v] of Object.entries(envObj)) {
        expandedEnv[k] = typeof v === "string" ? expandEnvVars(v) : v
      }
      expanded.env = expandedEnv
    }
    if (expanded.headers && typeof expanded.headers === "object") {
      const headersObj = expanded.headers as Record<string, string>
      const expandedHeaders: Record<string, string> = {}
      for (const [k, v] of Object.entries(headersObj)) {
        expandedHeaders[k] = typeof v === "string" ? expandEnvVars(v) : v
      }
      expanded.headers = expandedHeaders
    }
    result[name] = expanded
  }
  return result
}

/**
 * Read .mcp.json from a project root directory.
 * Supports both nested { "mcpServers": {...} } and flat { "server-name": {...} } formats.
 * Expands environment variables in server configs.
 * Returns empty record if file doesn't exist or is invalid.
 */
export async function readProjectMcpJson(
  projectPath: string,
): Promise<Record<string, McpServerConfig>> {
  try {
    const mcpJsonPath = path.join(projectPath, ".mcp.json")
    const content = await fs.readFile(mcpJsonPath, "utf-8")
    const parsed = JSON.parse(content)

    let servers: Record<string, McpServerConfig>
    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      // Nested format: { "mcpServers": { "name": { ... } } }
      servers = parsed.mcpServers
    } else {
      // Flat format: { "name": { "command": ..., ... } }
      // Filter out non-server keys (a server entry should be an object with command or url)
      servers = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          key !== "mcpServers"
        ) {
          servers[key] = value as McpServerConfig
        }
      }
    }

    return expandMcpServerEnvVars(servers)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        `[claude-config] Failed to read .mcp.json from ${projectPath}:`,
        error,
      )
    }
    return {}
  }
}

/**
 * Read ~/.claude/.claude.json (v2.0.8+ user-scope config, same format as ~/.claude.json)
 */
export async function readClaudeDirConfig(): Promise<ClaudeConfig> {
  try {
    const content = await fs.readFile(getClaudeDirConfigPath(), "utf-8")
    return JSON.parse(content)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error(
        "[claude-config] Failed to read ~/.claude/.claude.json:",
        error,
      )
    }
    return {}
  }
}

/**
 * Read ~/.claude/mcp.json (user-scope MCP definitions only)
 * Format: { "mcpServers": { "name": { ... } } } or flat { "name": { ... } }
 */
export async function readClaudeDirMcpJson(): Promise<
  Record<string, McpServerConfig>
> {
  try {
    const content = await fs.readFile(getClaudeDirMcpPath(), "utf-8")
    const parsed = JSON.parse(content)

    if (parsed.mcpServers && typeof parsed.mcpServers === "object") {
      return parsed.mcpServers
    }
    // Flat format
    const servers: Record<string, McpServerConfig> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        key !== "mcpServers"
      ) {
        servers[key] = value as McpServerConfig
      }
    }
    return servers
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[claude-config] Failed to read ~/.claude/mcp.json:", error)
    }
    return {}
  }
}

/**
 * Get merged global MCP servers from all user-level sources.
 * Precedence (highest first): ~/.claude.json > ~/.claude/.claude.json > ~/.claude/mcp.json
 */
export async function getMergedGlobalMcpServers(
  claudeConfig?: ClaudeConfig,
  claudeDirConfig?: ClaudeConfig,
): Promise<Record<string, McpServerConfig>> {
  const config = claudeConfig ?? (await readClaudeConfig())
  const dirConfig = claudeDirConfig ?? (await readClaudeDirConfig())
  const claudeDirMcp = await readClaudeDirMcpJson()

  // Lower priority first, higher priority overwrites
  return filterLocusPluginMcpServers({
    ...claudeDirMcp,
    ...(dirConfig.mcpServers || {}),
    ...(config.mcpServers || {}),
  })
}

/**
 * Get merged MCP servers for a specific project from per-project configs.
 * Precedence (highest first): ~/.claude.json per-project > ~/.claude/.claude.json per-project
 * Note: Does NOT include .mcp.json (caller handles that separately for caching)
 */
export async function getMergedLocalProjectMcpServers(
  projectPath: string,
  claudeConfig?: ClaudeConfig,
  claudeDirConfig?: ClaudeConfig,
): Promise<Record<string, McpServerConfig>> {
  const config = claudeConfig ?? (await readClaudeConfig())
  const dirConfig = claudeDirConfig ?? (await readClaudeDirConfig())

  const resolvedPath =
    resolveProjectPathFromWorktree(projectPath) || projectPath

  const claudeDirProjectServers =
    dirConfig.projects?.[resolvedPath]?.mcpServers || {}
  const mainProjectServers = config.projects?.[resolvedPath]?.mcpServers || {}

  // Higher priority overwrites
  return {
    ...claudeDirProjectServers,
    ...mainProjectServers,
  }
}
