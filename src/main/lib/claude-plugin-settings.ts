import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json")

let enabledPluginsCache: { plugins: string[]; timestamp: number } | null = null
const ENABLED_PLUGINS_CACHE_TTL_MS = 5000

let approvedMcpCache: { servers: string[]; timestamp: number } | null = null
const APPROVED_MCP_CACHE_TTL_MS = 5000

export function invalidateEnabledPluginsCache(): void {
  enabledPluginsCache = null
}

export function invalidateApprovedMcpCache(): void {
  approvedMcpCache = null
}

export async function readClaudeSettings(): Promise<Record<string, unknown>> {
  try {
    const content = await fs.readFile(CLAUDE_SETTINGS_PATH, "utf-8")
    return JSON.parse(content)
  } catch {
    return {}
  }
}

export async function writeClaudeSettings(settings: Record<string, unknown>): Promise<void> {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8")
}

export async function getEnabledPlugins(): Promise<string[]> {
  if (
    enabledPluginsCache &&
    Date.now() - enabledPluginsCache.timestamp < ENABLED_PLUGINS_CACHE_TTL_MS
  ) {
    return enabledPluginsCache.plugins
  }

  const settings = await readClaudeSettings()
  const plugins = Array.isArray(settings.enabledPlugins)
    ? settings.enabledPlugins as string[]
    : []

  enabledPluginsCache = { plugins, timestamp: Date.now() }
  return plugins
}

export async function getApprovedPluginMcpServers(): Promise<string[]> {
  if (
    approvedMcpCache &&
    Date.now() - approvedMcpCache.timestamp < APPROVED_MCP_CACHE_TTL_MS
  ) {
    return approvedMcpCache.servers
  }

  const settings = await readClaudeSettings()
  const servers = Array.isArray(settings.approvedPluginMcpServers)
    ? settings.approvedPluginMcpServers as string[]
    : []

  approvedMcpCache = { servers, timestamp: Date.now() }
  return servers
}

export async function isPluginMcpApproved(
  pluginSource: string,
  serverName: string,
): Promise<boolean> {
  const approved = await getApprovedPluginMcpServers()
  const identifier = `${pluginSource}:${serverName}`
  return approved.includes(identifier)
}
