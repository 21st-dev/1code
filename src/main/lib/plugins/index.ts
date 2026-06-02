import * as fs from "fs/promises"
import type { Dirent } from "fs"
import * as path from "path"
import * as os from "os"
import {
  getManifestOnlyPluginTargetMode,
  getDeveloperTrustedPluginTargetMode,
  getPluginSourceDiagnostics,
  type PluginDiagnostic,
  type PluginExecutionStatus,
  type PluginTargetMode,
  type PluginUpdatePosture,
} from "../../../shared/plugin-target-modes"
import type { PluginSourcePin } from "../../../shared/plugin-update-review"
import type { McpServerConfig } from "../claude-config"
import { isDirentDirectory } from "../fs/dirent"
import {
  buildCurrentPluginMcpApprovalIdentifier,
  getDeveloperPluginSources,
  extractCodexSourcePins,
  recordPluginReviewScans,
} from "./update-review-state"
import { scanPluginReviewDocument } from "./review-scan"
import { buildPluginSafetyGate, type PluginSafetyGate } from "../../../shared/plugin-safety-gates"
import { parseDeveloperTrustedManifest } from "../../../shared/plugin-developer-trusted"

export type PluginRuntime = "claude" | "codex"
export type PluginSourceKind = "local-marketplace" | "cache" | "developer-local"
export type PluginSourceTrust = "official" | "local" | "external"
export type PluginSourceStatus = "available" | "empty" | "missing"

interface PluginComponentPaths {
  commands?: string
  skills?: string
  agents?: string
  mcpServers?: string
}

export interface PluginInfo {
  runtime: PluginRuntime
  reviewKey: string
  name: string
  version: string
  description?: string
  path: string
  installRoot: string
  sourceRoot?: string
  source: string // e.g., "marketplace:plugin-name"
  marketplace: string // e.g., "claude-plugins-official"
  category?: string
  homepage?: string
  tags?: string[]
  componentPaths?: PluginComponentPaths
  sourceKind: PluginSourceKind
  sourceTrust: PluginSourceTrust
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  updatePosture: PluginUpdatePosture
  diagnostics: PluginDiagnostic[]
  sourcePins?: PluginSourcePin[]
}

export interface PluginSourceInfo {
  id: string
  runtime: PluginRuntime
  name: string
  description: string
  kind: PluginSourceKind
  trust: PluginSourceTrust
  status: PluginSourceStatus
  path: string
  pluginCount: number
  installHint: string
  diagnostics: PluginDiagnostic[]
  homepage?: string
}

interface MarketplacePlugin {
  name: string
  version?: string
  description?: string
  source: string | { source: string; url: string }
  category?: string
  homepage?: string
  tags?: string[]
}

interface MarketplaceJson {
  name: string
  plugins: MarketplacePlugin[]
}

interface CodexPluginJson {
  name?: string
  version?: string
  description?: string
  homepage?: string
  repository?: string
  keywords?: unknown
  commands?: unknown
  skills?: unknown
  agents?: unknown
  mcpServers?: unknown
  interface?: {
    displayName?: string
    shortDescription?: string
    category?: string
    websiteURL?: string
  }
}

export interface PluginMcpConfig {
  runtime: PluginRuntime
  pluginSource: string // e.g., "ccsetup:ccsetup"
  pluginReviewKey: string
  reviewGate: PluginSafetyGate
  mcpServers: Record<string, McpServerConfig>
  approvalIdentifiers: Record<string, string>
}

interface PluginComponentPathResolution {
  path?: string
  diagnostics: PluginDiagnostic[]
}

interface PluginComponentPathsResolution {
  componentPaths: PluginComponentPaths
  diagnostics: PluginDiagnostic[]
}

// Cache for plugin discovery results
let pluginCache: { plugins: PluginInfo[]; timestamp: number } | null = null
let codexPluginCache: { plugins: PluginInfo[]; timestamp: number } | null = null
const CACHE_TTL_MS = 30000 // 30 seconds - plugins don't change often during a session
const CLAUDE_MARKETPLACES_DIR = path.join(os.homedir(), ".claude", "plugins", "marketplaces")
const CODEX_PLUGIN_CACHE_DIR = path.join(os.homedir(), ".codex", "plugins", "cache")

/**
 * Clear plugin caches (for testing/manual invalidation)
 */
export function clearPluginCache() {
  pluginCache = null
  codexPluginCache = null
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined
}

function getStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const values = value.filter((item): item is string => typeof item === "string")
  return values.length > 0 ? values : undefined
}

function isPathInside(basePath: string, candidatePath: string): boolean {
  const relativePath = path.relative(basePath, candidatePath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  )
}

export async function resolvePluginComponentPathWithDiagnostics(
  pluginRoot: string,
  value: unknown,
  fallbackName: string,
): Promise<PluginComponentPathResolution> {
  const componentPath = getString(value)
  const candidate = componentPath
    ? path.resolve(pluginRoot, componentPath)
    : path.join(pluginRoot, fallbackName)

  if (!isPathInside(pluginRoot, candidate)) {
    return {
      diagnostics: [{
        code: "component-path-outside-root",
        severity: "warning",
      }],
    }
  }

  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(pluginRoot),
      fs.realpath(candidate),
    ])
    if (!isPathInside(realRoot, realCandidate)) {
      return {
        diagnostics: [{
          code: "component-path-outside-root",
          severity: "warning",
        }],
      }
    }
  } catch {
    // Missing component directories are normal. Keep the syntactically safe path
    // so later scans can return an empty component list.
  }

  return {
    path: candidate,
    diagnostics: [],
  }
}

export async function resolvePluginComponentPath(
  pluginRoot: string,
  value: unknown,
  fallbackName: string,
): Promise<string | undefined> {
  const result = await resolvePluginComponentPathWithDiagnostics(
    pluginRoot,
    value,
    fallbackName,
  )
  return result.path
}

export async function resolveClaudeMarketplacePluginPath(
  marketplacePath: string,
  sourcePath: string,
): Promise<string | undefined> {
  const pluginPath = path.resolve(marketplacePath, sourcePath)
  if (!isPathInside(marketplacePath, pluginPath)) return undefined

  try {
    const [realMarketplacePath, realPluginPath] = await Promise.all([
      fs.realpath(marketplacePath),
      fs.realpath(pluginPath),
    ])
    if (!isPathInside(realMarketplacePath, realPluginPath)) return undefined

    const pluginStat = await fs.stat(pluginPath)
    return pluginStat.isDirectory() ? pluginPath : undefined
  } catch {
    return undefined
  }
}

async function resolvePluginComponentPaths(
  pluginRoot: string,
  parsed: CodexPluginJson,
): Promise<PluginComponentPathsResolution> {
  const [commands, skills, agents, mcpServers] = await Promise.all([
    resolvePluginComponentPathWithDiagnostics(pluginRoot, parsed.commands, "commands"),
    resolvePluginComponentPathWithDiagnostics(pluginRoot, parsed.skills, "skills"),
    resolvePluginComponentPathWithDiagnostics(pluginRoot, parsed.agents, "agents"),
    resolvePluginComponentPathWithDiagnostics(pluginRoot, parsed.mcpServers, ".mcp.json"),
  ])

  return {
    componentPaths: {
      commands: commands.path,
      skills: skills.path,
      agents: agents.path,
      mcpServers: mcpServers.path,
    },
    diagnostics: [
      ...commands.diagnostics,
      ...skills.diagnostics,
      ...agents.diagnostics,
      ...mcpServers.diagnostics,
    ],
  }
}

async function getDirectoryStatus(targetPath: string): Promise<PluginSourceStatus> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(targetPath, { withFileTypes: true })
  } catch {
    return "missing"
  }

  return entries.some((entry) => !entry.name.startsWith(".")) ? "available" : "empty"
}

function formatSourceName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\bOpenai\b/g, "OpenAI")
}

function getSourceTrust(runtime: PluginRuntime, marketplace: string): PluginSourceTrust {
  if (runtime === "codex" && marketplace.startsWith("openai-")) return "official"
  return "local"
}

function getSourceDescription(runtime: PluginRuntime): string {
  return runtime === "claude"
    ? "Local Claude Code plugin marketplace source."
    : "Codex plugin cache collection managed by Codex."
}

function getSourceDescriptionForKind(kind: PluginSourceKind, runtime: PluginRuntime): string {
  if (kind === "developer-local") return "Local developer plugin source selected by the user."
  return getSourceDescription(runtime)
}

function getSourceInstallHint(runtime: PluginRuntime): string {
  return runtime === "claude"
    ? "Install Claude plugin marketplaces under ~/.claude/plugins/marketplaces/."
    : "Codex manages this cache; install or update plugins through Codex, then refresh."
}

function getSourceInstallHintForKind(kind: PluginSourceKind, runtime: PluginRuntime): string {
  if (kind === "developer-local") {
    return "Register local developer plugin directories explicitly. Developer plugins are full local code trust."
  }
  return getSourceInstallHint(runtime)
}

function getSourceKind(runtime: PluginRuntime): PluginSourceKind {
  return runtime === "claude" ? "local-marketplace" : "cache"
}

async function discoverDeveloperTrustedPlugins(): Promise<PluginInfo[]> {
  const sources = await getDeveloperPluginSources()
  const plugins: PluginInfo[] = []

  for (const source of sources) {
    const manifestPath = path.join(source.path, ".locus-plugin", "developer.json")
    let parsedManifest: ReturnType<typeof parseDeveloperTrustedManifest> | undefined
    try {
      parsedManifest = parseDeveloperTrustedManifest(
        JSON.parse(await fs.readFile(manifestPath, "utf-8")) as unknown,
      )
    } catch {
      parsedManifest = undefined
    }
    const manifest = parsedManifest?.manifest
    plugins.push({
      runtime: "claude",
      reviewKey: `developer:${source.id}`,
      name: manifest?.name ?? path.basename(source.path),
      version: manifest?.version ?? "0.0.0",
      description: manifest?.description,
      path: source.path,
      installRoot: source.path,
      sourceRoot: source.path,
      source: `developer:${source.id}`,
      marketplace: `developer:${source.id}`,
      category: "Developer",
      sourceKind: "developer-local",
      sourceTrust: "local",
      diagnostics: [],
      sourcePins: [],
      ...getDeveloperTrustedPluginTargetMode(),
    })
  }

  return plugins
}


/**
 * Discover all installed plugins from ~/.claude/plugins/marketplaces/
 * Returns array of plugin info with paths to their component directories
 * Results are cached for 30 seconds to avoid repeated filesystem scans
 */
export async function discoverInstalledPlugins(): Promise<PluginInfo[]> {
  // Return cached result if still valid
  if (pluginCache && Date.now() - pluginCache.timestamp < CACHE_TTL_MS) {
    return pluginCache.plugins
  }

  const plugins: PluginInfo[] = []
  const marketplacesDir = CLAUDE_MARKETPLACES_DIR

  try {
    await fs.access(marketplacesDir)
  } catch {
    pluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  let marketplaces: Dirent[]
  try {
    marketplaces = await fs.readdir(marketplacesDir, { withFileTypes: true })
  } catch {
    pluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  for (const marketplace of marketplaces) {
    if (marketplace.name.startsWith(".")) continue

    const isMarketplaceDir = await isDirentDirectory(
      marketplacesDir,
      marketplace,
    )
    if (!isMarketplaceDir) continue

    const marketplacePath = path.join(marketplacesDir, marketplace.name)
    const marketplaceJsonPath = path.join(marketplacePath, ".claude-plugin", "marketplace.json")

    try {
      const content = await fs.readFile(marketplaceJsonPath, "utf-8")

      let marketplaceJson: MarketplaceJson
      try {
        marketplaceJson = JSON.parse(content)
      } catch {
        continue
      }

      if (!Array.isArray(marketplaceJson.plugins)) {
        continue
      }

      for (const plugin of marketplaceJson.plugins) {
        // Validate plugin.source exists
        if (!plugin.source) continue

        // source can be a string path or an object { source: "url", url: "..." }
        const sourcePath = typeof plugin.source === "string" ? plugin.source : null
        if (!sourcePath) continue

        try {
          const pluginPath = await resolveClaudeMarketplacePluginPath(marketplacePath, sourcePath)
          if (!pluginPath) continue
          plugins.push({
            runtime: "claude",
            reviewKey: `claude:${marketplaceJson.name}:${plugin.name}`,
            name: plugin.name,
            version: plugin.version || "0.0.0",
            description: plugin.description,
            path: pluginPath,
            installRoot: marketplacesDir,
            sourceRoot: marketplacePath,
            source: `${marketplaceJson.name}:${plugin.name}`,
            marketplace: marketplaceJson.name,
            category: plugin.category,
            homepage: plugin.homepage,
            tags: plugin.tags,
            sourceKind: getSourceKind("claude"),
            sourceTrust: getSourceTrust("claude", marketplaceJson.name),
            diagnostics: [],
            ...getManifestOnlyPluginTargetMode(),
          })
        } catch {
          // Plugin directory not found, skip
        }
      }
    } catch {
      // No marketplace.json, skip silently (expected for non-plugin directories)
    }
  }

  pluginCache = { plugins, timestamp: Date.now() }
  return plugins
}

/**
 * Discover installed Codex plugins from ~/.codex/plugins/cache/
 * These are listed for visibility only; this app does not own Codex plugin
 * enablement state.
 */
export async function discoverCodexInstalledPlugins(): Promise<PluginInfo[]> {
  if (codexPluginCache && Date.now() - codexPluginCache.timestamp < CACHE_TTL_MS) {
    return codexPluginCache.plugins
  }

  const plugins: PluginInfo[] = []
  const cacheRoot = CODEX_PLUGIN_CACHE_DIR

  try {
    await fs.access(cacheRoot)
  } catch {
    codexPluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  let collections: Dirent[]
  try {
    collections = await fs.readdir(cacheRoot, { withFileTypes: true })
  } catch {
    codexPluginCache = { plugins, timestamp: Date.now() }
    return plugins
  }

  for (const collection of collections) {
    if (collection.name.startsWith(".")) continue
    if (!(await isDirentDirectory(cacheRoot, collection))) continue

    const collectionPath = path.join(cacheRoot, collection.name)
    let pluginEntries: Dirent[]
    try {
      pluginEntries = await fs.readdir(collectionPath, { withFileTypes: true })
    } catch {
      continue
    }

    for (const pluginEntry of pluginEntries) {
      if (pluginEntry.name.startsWith(".")) continue
      if (!(await isDirentDirectory(collectionPath, pluginEntry))) continue

      const pluginFamilyPath = path.join(collectionPath, pluginEntry.name)
      let versionEntries: Dirent[]
      try {
        versionEntries = await fs.readdir(pluginFamilyPath, { withFileTypes: true })
      } catch {
        continue
      }

      for (const versionEntry of versionEntries) {
        if (versionEntry.name.startsWith(".")) continue
        if (!(await isDirentDirectory(pluginFamilyPath, versionEntry))) continue

        const pluginPath = path.join(pluginFamilyPath, versionEntry.name)
        const pluginJsonPath = path.join(pluginPath, ".codex-plugin", "plugin.json")

        let parsed: CodexPluginJson
        try {
          const content = await fs.readFile(pluginJsonPath, "utf-8")
          parsed = JSON.parse(content) as CodexPluginJson
        } catch {
          continue
        }

        const displayName =
          getString(parsed.interface?.displayName) ??
          getString(parsed.name) ??
          pluginEntry.name
        const description =
          getString(parsed.interface?.shortDescription) ??
          getString(parsed.description)
        const homepage =
          getString(parsed.homepage) ??
          getString(parsed.interface?.websiteURL) ??
          getString(parsed.repository)

        const { componentPaths, diagnostics } = await resolvePluginComponentPaths(pluginPath, parsed)

        plugins.push({
          runtime: "codex",
          reviewKey: `codex:${collection.name}:${pluginEntry.name}`,
          name: displayName,
          version: getString(parsed.version) ?? versionEntry.name,
          description,
          path: pluginPath,
          installRoot: cacheRoot,
          sourceRoot: collectionPath,
          source: `${collection.name}:${pluginEntry.name}@${versionEntry.name}`,
          marketplace: collection.name,
          category: getString(parsed.interface?.category),
          homepage,
          tags: getStringArray(parsed.keywords),
          componentPaths,
          sourceKind: getSourceKind("codex"),
          sourceTrust: getSourceTrust("codex", collection.name),
          diagnostics,
          sourcePins: await extractCodexSourcePins(pluginPath, versionEntry.name),
          ...getManifestOnlyPluginTargetMode(),
        })
      }
    }
  }

  codexPluginCache = { plugins, timestamp: Date.now() }
  return plugins
}

export async function discoverAllRuntimePlugins(): Promise<PluginInfo[]> {
  const [claudePlugins, codexPlugins, developerPlugins] = await Promise.all([
    discoverInstalledPlugins(),
    discoverCodexInstalledPlugins(),
    discoverDeveloperTrustedPlugins(),
  ])
  return [...claudePlugins, ...codexPlugins, ...developerPlugins]
}

export async function discoverPluginSources(): Promise<PluginSourceInfo[]> {
  const [plugins, claudeRootStatus, codexRootStatus] = await Promise.all([
    discoverAllRuntimePlugins(),
    getDirectoryStatus(CLAUDE_MARKETPLACES_DIR),
    getDirectoryStatus(CODEX_PLUGIN_CACHE_DIR),
  ])

  const bySource = new Map<string, {
    runtime: PluginRuntime
    marketplace: string
    path: string
    pluginCount: number
    kind: PluginSourceKind
  }>()

  for (const plugin of plugins) {
    const key = `${plugin.runtime}:${plugin.marketplace}`
    const existing = bySource.get(key)
    if (existing) {
      existing.pluginCount += 1
      continue
    }
    bySource.set(key, {
      runtime: plugin.runtime,
      marketplace: plugin.marketplace,
      path: plugin.sourceRoot ?? plugin.installRoot,
      pluginCount: 1,
      kind: plugin.sourceKind,
    })
  }

  const sources = Array.from(bySource.values()).map((source): PluginSourceInfo => {
    const status: PluginSourceStatus = "available"
    return {
      id: `${source.runtime}:${source.marketplace}`,
      runtime: source.runtime,
      name: formatSourceName(source.marketplace),
      description: getSourceDescriptionForKind(source.kind, source.runtime),
      kind: source.kind,
      trust: getSourceTrust(source.runtime, source.marketplace),
      status,
      path: source.path,
      pluginCount: source.pluginCount,
      installHint: getSourceInstallHintForKind(source.kind, source.runtime),
      diagnostics: getPluginSourceDiagnostics({ status }),
    }
  })

  if (!sources.some((source) => source.runtime === "claude")) {
    const status = claudeRootStatus === "available" ? "empty" : claudeRootStatus
    sources.push({
      id: "claude:local-marketplaces",
      runtime: "claude",
      name: "Claude Local Marketplaces",
      description: getSourceDescription("claude"),
      kind: "local-marketplace",
      trust: "local",
      status,
      path: CLAUDE_MARKETPLACES_DIR,
      pluginCount: 0,
      installHint: getSourceInstallHint("claude"),
      diagnostics: getPluginSourceDiagnostics({ status }),
    })
  }

  if (!sources.some((source) => source.runtime === "codex")) {
    const status = codexRootStatus === "available" ? "empty" : codexRootStatus
    sources.push({
      id: "codex:plugin-cache",
      runtime: "codex",
      name: "Codex Plugin Cache",
      description: getSourceDescription("codex"),
      kind: "cache",
      trust: "local",
      status,
      path: CODEX_PLUGIN_CACHE_DIR,
      pluginCount: 0,
      installHint: getSourceInstallHint("codex"),
      diagnostics: getPluginSourceDiagnostics({ status }),
    })
  }

  return sources.sort((a, b) => {
    if (a.runtime !== b.runtime) return a.runtime.localeCompare(b.runtime)
    return a.name.localeCompare(b.name)
  })
}

/**
 * Get component paths for a plugin (commands, skills, agents directories)
 */
export function getPluginComponentPaths(plugin: PluginInfo) {
  return {
    commands: plugin.componentPaths?.commands ?? path.join(plugin.path, "commands"),
    skills: plugin.componentPaths?.skills ?? path.join(plugin.path, "skills"),
    agents: plugin.componentPaths?.agents ?? path.join(plugin.path, "agents"),
    mcpServers: plugin.componentPaths?.mcpServers ?? path.join(plugin.path, ".mcp.json"),
  }
}

/**
 * Discover MCP server configs from all installed plugins
 * Reads .mcp.json from each plugin directory
 * Recomputes review gates on each call so stale plugin fingerprints cannot
 * reuse cached runtime decisions.
 */
export async function discoverPluginMcpServers(): Promise<PluginMcpConfig[]> {
  const plugins = await discoverInstalledPlugins()
  const configs: PluginMcpConfig[] = []

  for (const plugin of plugins) {
    const mcpJsonPath = path.join(plugin.path, ".mcp.json")
    try {
      const content = await fs.readFile(mcpJsonPath, "utf-8")
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(content)
      } catch {
        continue
      }

      // Support two formats:
      // Format A (flat): { "server-name": { "command": "...", ... } }
      // Format B (nested): { "mcpServers": { "server-name": { ... } } }
      const serversObj =
        parsed.mcpServers &&
        typeof parsed.mcpServers === "object" &&
        !Array.isArray(parsed.mcpServers)
          ? (parsed.mcpServers as Record<string, unknown>)
          : parsed

      const validServers: Record<string, McpServerConfig> = {}
      const approvalIdentifiers: Record<string, string> = {}
      for (const [name, config] of Object.entries(serversObj)) {
        if (config && typeof config === "object" && !Array.isArray(config)) {
          const serverConfig = config as McpServerConfig
          validServers[name] = serverConfig
          approvalIdentifiers[name] = buildCurrentPluginMcpApprovalIdentifier({
            pluginSource: plugin.source,
            serverName: name,
            config: serverConfig,
          })
        }
      }

      if (Object.keys(validServers).length > 0) {
        const reviewScan = await scanPluginReviewDocument(plugin)
        const reviewResult = await recordPluginReviewScans([{
          pluginKey: plugin.reviewKey,
          document: reviewScan.reviewDocument,
        }])
        const updateReview =
          reviewResult.metadataByPluginKey[plugin.reviewKey]
        const reviewGate = buildPluginSafetyGate({
          runtime: plugin.runtime,
          hasMcpServers: reviewScan.components.mcpServers.length > 0,
          updateReviewStatus: updateReview?.status,
          safeModeEnabled: reviewResult.safeMode.enabled,
        })

        configs.push({
          runtime: plugin.runtime,
          pluginSource: plugin.source,
          pluginReviewKey: plugin.reviewKey,
          reviewGate,
          mcpServers: validServers,
          approvalIdentifiers,
        })
      }
    } catch {
      // No .mcp.json file, skip silently (this is expected for most plugins)
    }
  }

  return configs
}
