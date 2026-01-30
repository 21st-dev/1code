/**
 * ii MCP Server Manager
 *
 * Manages Python FastMCP servers for HTTP transport.
 * The app spawns these servers as background processes and registers
 * them in ~/.claude.json with HTTP URLs.
 */
import { spawn, type ChildProcess } from "child_process"
import * as fs from "fs/promises"
import * as path from "path"
import { readClaudeConfig, writeClaudeConfig, type McpServerConfig } from "./claude-config"

// Server configuration with ports
const SERVERS = [
  { name: "ii-dev-server", port: 11021, modulePath: "internal.mcp_integration.dev_server.server" },
  { name: "ii-package-manager", port: 11022, modulePath: "internal.mcp_integration.package_manager.server" },
  { name: "ii-db-manager", port: 11023, modulePath: "internal.mcp_integration.db_manager.server" },
  { name: "ii-structure", port: 11024, modulePath: "internal.mcp_integration.structure.server" },
  { name: "ii-config-manager", port: 11025, modulePath: "internal.mcp_integration.config_manager.server" },
  { name: "ii-architecture", port: 11026, modulePath: "internal.mcp_integration.architecture.server" },
  { name: "ii-plan", port: 11027, modulePath: "internal.mcp_integration.plan.server" },
] as const

type ServerName = typeof SERVERS[number]["name"]

// Track spawned processes
const _processes = new Map<ServerName, ChildProcess>()

/**
 * Get the ii project root directory (parent of ii-client)
 */
export function getIiRoot(): string {
  // Most reliable approach: use the app path derived from process.execPath
  // In dev: /Users/.../ii/ii-client/node_modules/electron/dist/Electron.app/...
  // In prod: /Users/.../ii/ii-client/out/mac-arm64/1Code.app/Contents/MacOS/1Code
  const execDir = path.dirname(process.execPath)

  // Try different relative paths to find ii root
  const candidates = [
    // Development: from ii/ii-client directory
    path.join(execDir, "..", "..", "..", "ii"),
    // Production: from Contents/MacOS/1Code -> Contents/Resources -> ii
    path.join(execDir, "..", "..", "Resources", "ii"),
    // Development from cwd
    path.join(process.cwd(), "..", "ii"),
    // Development from ii/ii-client/src/main/lib (via __dirname)
    path.join(__dirname, "..", "..", "..", "..", "ii"),
  ]

  for (const candidate of candidates) {
    const mcpPath = path.join(candidate, "internal", "mcp_integration")
    try {
      fs.accessSync(mcpPath)
      console.log(`[ii-mcp] Found iiRoot: ${candidate}`)
      return candidate
    } catch {
      // Continue to next candidate
    }
  }

  // Ultimate fallback - try the standard path
  const fallback = path.join(process.cwd(), "..", "ii")
  console.warn(`[ii-mcp] Using fallback iiRoot: ${fallback}`)
  return fallback
}

/**
 * Get the Python interpreter path
 */
function getPythonPath(iiRoot: string): string {
  // Try .venv first
  const venvPython = path.join(iiRoot, ".venv", "bin", "python")
  try {
    fs.access(venvPython)
    return venvPython
  } catch {
    // Fallback to system python
    return process.env.PYTHON_PATH || "python3"
  }
}

/**
 * Start all ii MCP servers as background processes with HTTP transport
 */
export async function startIiMcpServers(iiRoot: string): Promise<void> {
  const pythonPath = getPythonPath(iiRoot)
  console.log(`[ii-mcp] Starting servers with iiRoot: ${iiRoot}`)

  for (const server of SERVERS) {
    const scriptPath = path.join(iiRoot, server.modulePath.replace(/\./g, path.sep) + ".py")
    const envKey = `II_MCP_${server.name.replace(/-/g, "_").toUpperCase()}_PORT`

    const proc = spawn(pythonPath, [scriptPath], {
      env: {
        ...process.env,
        II_PROJECT_PATH: iiRoot,
        II_MCP_TRANSPORT: "http",
        [envKey]: String(server.port),
      },
      stdio: ["ignore", "pipe", "pipe"],
    })

    // Track the process
    _processes.set(server.name, proc)

    // Log output for debugging
    proc.stdout?.on("data", (data) => {
      process.stdout.write(`[ii-mcp:${server.name}] ${data}`)
    })
    proc.stderr?.on("data", (data) => {
      process.stderr.write(`[ii-mcp:${server.name}] ${data}`)
    })

    // Handle process exit
    proc.on("error", (err) => {
      console.error(`[ii-mcp] Failed to start ${server.name}: ${err}`)
      _processes.delete(server.name)
    })

    proc.on("exit", (code) => {
      if (code !== 0) {
        console.warn(`[ii-mcp] ${server.name} exited with code ${code}`)
      }
      _processes.delete(server.name)
    })

    console.log(`[ii-mcp] Started ${server.name} on port ${server.port}`)
  }

  console.log(`[ii-mcp] All ${SERVERS.length} servers started`)
}

/**
 * Stop all ii MCP server processes
 */
export async function stopIiMcpServers(): Promise<void> {
  for (const [name, proc] of _processes) {
    try {
      proc.kill("SIGTERM")
      console.log(`[ii-mcp] Stopped ${name}`)
    } catch (err) {
      console.warn(`[ii-mcp] Failed to stop ${name}: ${err}`)
    }
  }
  _processes.clear()
  console.log("[ii-mcp] All servers stopped")
}

/**
 * Check if a specific server is running
 */
export function isServerRunning(name: ServerName): boolean {
  return _processes.has(name)
}

/**
 * Get server configuration for ~/.claude.json using HTTP transport
 */
export function getIiMcpServerConfig(): Record<string, McpServerConfig> {
  const config: Record<string, McpServerConfig> = {}

  for (const server of SERVERS) {
    config[server.name] = {
      type: "http",
      url: `http://127.0.0.1:${server.port}/mcp`,
      authType: "none",
    }
  }

  return config
}

/**
 * Register ii MCP servers in ~/.claude.json
 */
export async function registerServersInConfig(): Promise<void> {
  try {
    const config = await readClaudeConfig()
    const iiConfig = getIiMcpServerConfig()

    // Merge, preserving existing non-ii servers
    config.mcpServers = { ...config.mcpServers, ...iiConfig }

    await writeClaudeConfig(config)
    console.log(`[ii-mcp] Registered servers: ${Object.keys(iiConfig).join(", ")}`)
  } catch (err) {
    console.warn(`[ii-mcp] Failed to register servers in config: ${err}`)
    // Non-fatal - app works without ii MCP tools
  }
}

/**
 * Unregister ii MCP servers from ~/.claude.json
 */
export async function unregisterServersFromConfig(): Promise<void> {
  try {
    const config = await readClaudeConfig()
    if (config.mcpServers) {
      for (const server of SERVERS) {
        delete config.mcpServers[server.name]
      }
      await writeClaudeConfig(config)
      console.log("[ii-mcp] Unregistered all ii servers from config")
    }
  } catch (err) {
    console.warn(`[ii-mcp] Failed to unregister servers from config: ${err}`)
  }
}

/**
 * Get list of all server names
 */
export function getServerNames(): ServerName[] {
  return SERVERS.map((s) => s.name)
}
