import * as fs from "fs/promises"
import type { Dirent } from "fs"
import * as os from "os"
import * as path from "path"
import matter from "gray-matter"
import { parseTOML } from "confbox/toml"
import type { SharedResource } from "./types"

const home = os.homedir()
const SKIPPED_SCAN_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "out",
])

interface CodexPluginManifest {
  name?: unknown
  version?: unknown
  description?: unknown
  homepage?: unknown
  repository?: unknown
  keywords?: unknown
  skills?: unknown
  mcpServers?: unknown
  apps?: unknown
  interface?: unknown
}

interface CodexPluginInterface {
  displayName?: unknown
  shortDescription?: unknown
  longDescription?: unknown
  developerName?: unknown
  category?: unknown
  capabilities?: unknown
}

interface CodexPluginMcpServerConfig {
  command?: unknown
  args?: unknown
  cwd?: unknown
  url?: unknown
  env?: unknown
  authType?: unknown
  _oauth?: unknown
  disabled?: unknown
  approved?: unknown
  description?: unknown
}

interface CodexNativeFileSpec {
  relativePath: string
  kind: "config" | "provider" | "hook"
  name: string
  description: string
  role: string
  containsSecrets?: boolean
}

export interface CollectCodexNativeResourcesParams {
  codexRoot?: string
  pluginCacheRoot?: string
  codexCacheRoot?: string
  projectPath?: string
}

function resourceId(parts: Array<string | undefined | null>): string {
  return parts.filter(Boolean).join(":")
}

function toDisplayPath(filePath: string, projectPath?: string): string {
  if (projectPath && filePath.startsWith(projectPath)) {
    return path.relative(projectPath, filePath)
  }
  return filePath.startsWith(home) ? `~${filePath.slice(home.length)}` : filePath
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function isSafePathSegment(name: string): boolean {
  return name !== "." && name !== ".." && !name.includes("/") && !name.includes("\\")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0
  )
  return strings.length > 0 ? strings : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function stringRecordValue(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  )
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function stringRecordKeys(value: unknown): string[] | undefined {
  if (!isRecord(value)) return undefined
  const keys = Object.keys(value).filter((key) => key.trim().length > 0).sort()
  return keys.length > 0 ? keys : undefined
}

function displayRelativeDir(root: string, filePath: string): string {
  return path.relative(root, path.dirname(filePath)).split(path.sep).filter(Boolean).join("/")
}

async function readFrontmatter(filePath: string): Promise<{
  name?: string
  description?: string
}> {
  const raw = await fs.readFile(filePath, "utf-8")
  const parsed = matter(raw)
  return {
    name: stringValue(parsed.data.name),
    description: stringValue(parsed.data.description),
  }
}

async function readTomlRecord(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const parsed = parseTOML<Record<string, unknown>>(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function findSkillFiles(root: string, maxDepth = 8): Promise<string[]> {
  if (!(await pathExists(root))) return []
  const files: string[] = []

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!isSafePathSegment(entry.name)) continue
      const entryPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (SKIPPED_SCAN_DIRS.has(entry.name)) continue
        await walk(entryPath, depth + 1)
        continue
      }

      if (entry.isFile() && entry.name === "SKILL.md") {
        files.push(entryPath)
      }
    }
  }

  await walk(root, 0)
  return files.sort((left, right) => left.localeCompare(right))
}

async function findCodexPluginManifests(root: string, maxDepth = 8): Promise<string[]> {
  if (!(await pathExists(root))) return []
  const manifests: string[] = []

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!isSafePathSegment(entry.name)) continue
      if (!entry.isDirectory()) continue

      const entryPath = path.join(dir, entry.name)
      if (entry.name === ".codex-plugin") {
        const manifestPath = path.join(entryPath, "plugin.json")
        if (await pathExists(manifestPath)) manifests.push(manifestPath)
        continue
      }

      if (SKIPPED_SCAN_DIRS.has(entry.name)) continue
      await walk(entryPath, depth + 1)
    }
  }

  await walk(root, 0)
  return manifests.sort((left, right) => left.localeCompare(right))
}

async function listJsonFiles(root: string): Promise<string[]> {
  if (!(await pathExists(root))) return []
  let entries: Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && isSafePathSegment(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort((left, right) => left.localeCompare(right))
}

function resolvePluginRelativePath(pluginPath: string, value: unknown): string | undefined {
  const relativePath = stringValue(value)
  if (!relativePath) return undefined
  return path.resolve(pluginPath, relativePath)
}

async function scanCodexSkillRoot(params: {
  root: string
  scope: "user" | "plugin"
  projectPath?: string
  pluginSource?: string
  pluginName?: string
  pluginVersion?: string
}): Promise<SharedResource[]> {
  const skillFiles = await findSkillFiles(params.root)
  const resources: SharedResource[] = []

  for (const filePath of skillFiles) {
    const relativeDir = displayRelativeDir(params.root, filePath)
    try {
      const parsed = await readFrontmatter(filePath)
      const name = parsed.name || relativeDir || path.basename(path.dirname(filePath))
      resources.push({
        id: resourceId([
          "skill",
          "codex",
          params.scope,
          params.pluginSource,
          relativeDir || name,
        ]),
        kind: "skill",
        name,
        scope: params.scope,
        engine: "codex",
        pluginSource: params.pluginSource,
        path: toDisplayPath(filePath, params.projectPath),
        description: parsed.description,
        enabled: true,
        metadata: {
          codexResourceRole: params.scope === "plugin" ? "plugin-skill" : "user-skill",
          entryName: relativeDir || name,
          relativeDir,
          skillRoot: toDisplayPath(params.root, params.projectPath),
          pluginName: params.pluginName,
          pluginVersion: params.pluginVersion,
        },
      })
    } catch {
      continue
    }
  }

  return resources
}

async function readCodexPluginManifest(manifestPath: string): Promise<CodexPluginManifest | null> {
  try {
    const raw = await fs.readFile(manifestPath, "utf-8")
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function readJsonRecord(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const parsed = JSON.parse(raw)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function collectCodexNativeFiles(params: {
  codexRoot: string
  projectPath?: string
}): Promise<SharedResource[]> {
  const specs: CodexNativeFileSpec[] = [
    {
      relativePath: "config.toml",
      kind: "config",
      name: "Codex config.toml",
      description: "Codex user configuration, model routing, sandbox, MCP, and UI defaults.",
      role: "config",
    },
    {
      relativePath: "auth.json",
      kind: "provider",
      name: "Codex auth.json",
      description: "Codex authentication state and account routing. Secret values are not read into the resource snapshot.",
      role: "auth",
      containsSecrets: true,
    },
    {
      relativePath: "hooks.json",
      kind: "hook",
      name: "Codex hooks.json",
      description: "Codex user hook configuration.",
      role: "hooks",
    },
    {
      relativePath: path.join("browser", "config.toml"),
      kind: "config",
      name: "Codex browser config.toml",
      description: "Codex browser tool configuration.",
      role: "browser-config",
    },
  ]

  const resources: SharedResource[] = []
  for (const spec of specs) {
    const filePath = path.join(params.codexRoot, spec.relativePath)
    if (!(await pathExists(filePath))) continue

    resources.push({
      id: resourceId(["codex", spec.kind, spec.role]),
      kind: spec.kind,
      name: spec.name,
      scope: "engine",
      engine: "codex",
      path: toDisplayPath(filePath, params.projectPath),
      description: spec.description,
      enabled: true,
      metadata: {
        codexResourceRole: spec.role,
        relativePath: spec.relativePath.split(path.sep).join("/"),
        containsSecrets: spec.containsSecrets === true,
      },
    })
  }

  return resources
}

async function collectCodexAutomations(params: {
  codexRoot: string
  projectPath?: string
}): Promise<SharedResource[]> {
  const automationsRoot = path.join(params.codexRoot, "automations")
  if (!(await pathExists(automationsRoot))) return []

  let entries: Dirent[]
  try {
    entries = await fs.readdir(automationsRoot, { withFileTypes: true })
  } catch {
    return []
  }

  const resources: SharedResource[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafePathSegment(entry.name)) continue
    const filePath = path.join(automationsRoot, entry.name, "automation.toml")
    if (!(await pathExists(filePath))) continue

    const parsed = await readTomlRecord(filePath)
    const id = stringValue(parsed?.id) || entry.name
    const name = stringValue(parsed?.name) || id
    const status = stringValue(parsed?.status)

    resources.push({
      id: resourceId(["codex", "automation", id]),
      kind: "automation",
      name,
      scope: "engine",
      engine: "codex",
      path: toDisplayPath(filePath, params.projectPath),
      description: stringValue(parsed?.prompt),
      enabled: status ? status.toLowerCase() !== "paused" : true,
      metadata: {
        codexResourceRole: "automation",
        automationId: id,
        kind: stringValue(parsed?.kind),
        status,
        rrule: stringValue(parsed?.rrule),
        model: stringValue(parsed?.model),
        engine: stringValue(parsed?.engine),
        reasoningEffort: stringValue(parsed?.reasoning_effort),
        executionEnvironment: stringValue(parsed?.execution_environment),
        lastRunAt: numberValue(parsed?.last_run_at),
        createdAt: numberValue(parsed?.created_at),
        updatedAt: numberValue(parsed?.updated_at),
        hasTargetThread: Boolean(stringValue(parsed?.target_thread_id)),
        hasCwds: Array.isArray(parsed?.cwds) && parsed.cwds.length > 0,
        isEnabled: booleanValue(parsed?.is_enabled),
      },
    })
  }

  return resources.sort((left, right) => left.id.localeCompare(right.id))
}

async function collectCodexConnectorResources(params: {
  cacheRoot: string
  projectPath?: string
}): Promise<SharedResource[]> {
  const files = await listJsonFiles(path.join(params.cacheRoot, "codex_app_directory"))
  const byId = new Map<string, SharedResource>()

  for (const filePath of files) {
    const parsed = await readJsonRecord(filePath)
    const connectors = Array.isArray(parsed?.connectors) ? parsed.connectors : []
    for (const connector of connectors) {
      if (!isRecord(connector)) continue
      const id = stringValue(connector.id)
      const name = stringValue(connector.name)
      if (!id || !name) continue

      const appMetadata = isRecord(connector.appMetadata) ? connector.appMetadata : {}
      const review = isRecord(appMetadata.review) ? appMetadata.review : {}
      const categories = stringArrayValue(appMetadata.categories)
      byId.set(id, {
        id: resourceId(["codex", "connector", id]),
        kind: "connector",
        name,
        scope: "engine",
        engine: "codex",
        path: toDisplayPath(filePath, params.projectPath),
        description: stringValue(connector.description),
        enabled: booleanValue(connector.isEnabled) ?? true,
        metadata: {
          codexResourceRole: "connector",
          connectorId: id,
          distributionChannel: stringValue(connector.distributionChannel),
          installUrl: stringValue(connector.installUrl),
          isAccessible: booleanValue(connector.isAccessible),
          isEnabled: booleanValue(connector.isEnabled),
          labels: stringRecordValue(connector.labels),
          categories,
          reviewStatus: stringValue(review.status),
          developer: stringValue(appMetadata.developer),
          version: stringValue(appMetadata.version),
          pluginDisplayNames: stringArrayValue(connector.pluginDisplayNames),
          logoUrl: stringValue(connector.logoUrl),
          logoUrlDark: stringValue(connector.logoUrlDark),
          cacheFile: toDisplayPath(filePath, params.projectPath),
        },
      })
    }
  }

  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id))
}

async function collectCodexAppsToolsResources(params: {
  cacheRoot: string
  projectPath?: string
}): Promise<SharedResource[]> {
  const resources = new Map<string, SharedResource>()

  for (const filePath of await listJsonFiles(path.join(params.cacheRoot, "codex_apps_server_info"))) {
    const parsed = await readJsonRecord(filePath)
    const serverInfo = isRecord(parsed?.server_info) ? parsed.server_info : null
    const name = stringValue(serverInfo?.name)
    if (!serverInfo || !name) continue
    resources.set(`server:${name}:${path.basename(filePath)}`, {
      id: resourceId(["codex", "mcp", "apps-server", name, path.basename(filePath, ".json")]),
      kind: "mcp",
      name,
      scope: "engine",
      engine: "codex",
      path: toDisplayPath(filePath, params.projectPath),
      description: stringValue(serverInfo.description),
      enabled: true,
      metadata: {
        codexResourceRole: "codex-apps-server",
        title: stringValue(serverInfo.title),
        version: stringValue(serverInfo.version),
        websiteUrl: stringValue(serverInfo.websiteUrl),
        cacheFile: toDisplayPath(filePath, params.projectPath),
      },
    })
  }

  for (const filePath of await listJsonFiles(path.join(params.cacheRoot, "codex_apps_tools"))) {
    const parsed = await readJsonRecord(filePath)
    const tools = Array.isArray(parsed?.tools) ? parsed.tools : []
    for (const item of tools) {
      if (!isRecord(item)) continue
      const tool = isRecord(item.tool) ? item.tool : {}
      const meta = isRecord(tool._meta) ? tool._meta : {}
      const codexAppsMeta = isRecord(meta._codex_apps) ? meta._codex_apps : {}
      const namespace = stringValue(item.tool_namespace)
      const toolName = stringValue(item.tool_name) || stringValue(tool.name)
      if (!namespace || !toolName) continue

      const connectorId =
        stringValue(item.connector_id) ||
        stringValue(meta.connector_id)
      const id = resourceId(["codex", "tool", namespace, toolName, connectorId])
      resources.set(id, {
        id,
        kind: "tool",
        name: stringValue(tool.title) || toolName,
        scope: "engine",
        engine: "codex",
        path: toDisplayPath(filePath, params.projectPath),
        description: stringValue(tool.description),
        enabled: true,
        metadata: {
          codexResourceRole: "codex-app-tool",
          serverName: stringValue(item.server_name),
          serverOrigin: stringValue(item.server_origin),
          supportsParallelToolCalls: booleanValue(item.supports_parallel_tool_calls),
          toolNamespace: namespace,
          toolName,
          namespaceDescription: stringValue(item.namespace_description),
          connectorId,
          connectorName:
            stringValue(item.connector_name) ||
            stringValue(meta.connector_name),
          connectorDescription: stringValue(meta.connector_description),
          linkId: stringValue(meta.link_id),
          resourceName: stringValue(meta.resource_name),
          resourceUri: stringValue(codexAppsMeta.resource_uri),
        containsMcpSource: booleanValue(codexAppsMeta.contains_mcp_source),
          annotations: isRecord(tool.annotations) ? tool.annotations : undefined,
          pluginDisplayNames: stringArrayValue(item.plugin_display_names),
          cacheFile: toDisplayPath(filePath, params.projectPath),
        },
      })
    }
  }

  return [...resources.values()].sort((left, right) => left.id.localeCompare(right.id))
}

async function collectCodexRemoteAppResources(params: {
  cacheRoot: string
  projectPath?: string
}): Promise<SharedResource[]> {
  const resources = new Map<string, SharedResource>()

  for (const filePath of await listJsonFiles(path.join(params.cacheRoot, "remote_plugin_catalog"))) {
    const parsed = await readJsonRecord(filePath)
    const plugins = Array.isArray(parsed?.plugins) ? parsed.plugins : []
    for (const plugin of plugins) {
      if (!isRecord(plugin)) continue
      const release = isRecord(plugin.release) ? plugin.release : {}
      const appManifest = isRecord(release.app_manifest) ? release.app_manifest : {}
      const apps = isRecord(appManifest.apps) ? appManifest.apps : {}
      const pluginId = stringValue(plugin.id)
      const pluginName = stringValue(release.display_name) || stringValue(plugin.name)
      const interfaceMeta = isRecord(release.interface) ? release.interface : {}

      for (const [appName, appValue] of Object.entries(apps)) {
        if (!isRecord(appValue)) continue
        const appId = stringValue(appValue.id)
        if (!appId) continue
        const id = resourceId(["codex", "app", appId])
        resources.set(id, {
          id,
          kind: "app",
          name: pluginName ? `${pluginName} / ${appName}` : appName,
          scope: "engine",
          engine: "codex",
          path: toDisplayPath(filePath, params.projectPath),
          description:
            stringValue(interfaceMeta.short_description) ||
            stringValue(release.description),
          enabled: stringValue(plugin.status) !== "UNAVAILABLE",
          metadata: {
            codexResourceRole: "remote-plugin-app",
            appId,
            appName,
            pluginId,
            pluginName: stringValue(plugin.name),
            displayName: pluginName,
            pluginStatus: stringValue(plugin.status),
            installationPolicy: stringValue(plugin.installation_policy),
            authenticationPolicy: stringValue(plugin.authentication_policy),
            discoverability: stringValue(plugin.discoverability),
            releaseVersion: stringValue(release.version),
            category: stringValue(interfaceMeta.category),
            developerName: stringValue(interfaceMeta.developer_name),
            defaultPrompt: stringValue(interfaceMeta.default_prompt),
            defaultPrompts: stringArrayValue(interfaceMeta.default_prompts),
            websiteUrl: stringValue(interfaceMeta.website_url),
            privacyPolicyUrl: stringValue(interfaceMeta.privacy_policy_url),
            termsOfServiceUrl: stringValue(interfaceMeta.terms_of_service_url),
            cacheFile: toDisplayPath(filePath, params.projectPath),
          },
        })
      }
    }
  }

  return [...resources.values()].sort((left, right) => left.id.localeCompare(right.id))
}

async function collectCodexPluginAppResources(params: {
  appManifestPath?: string
  pluginSource: string
  pluginName: string
  pluginVersion?: string
  projectPath?: string
}): Promise<SharedResource[]> {
  if (!params.appManifestPath || !(await pathExists(params.appManifestPath))) return []
  const parsed = await readJsonRecord(params.appManifestPath)
  const apps = isRecord(parsed?.apps) ? parsed.apps : {}
  const resources: SharedResource[] = []

  for (const [name, value] of Object.entries(apps)) {
    if (!isRecord(value)) continue
    const appId = stringValue(value.id)
    if (!appId) continue
    resources.push({
      id: resourceId(["codex", "app", "plugin", params.pluginSource, name]),
      kind: "app",
      name,
      scope: "plugin",
      engine: "codex",
      pluginSource: params.pluginSource,
      path: toDisplayPath(params.appManifestPath, params.projectPath),
      enabled: true,
      metadata: {
        codexResourceRole: "plugin-app",
        appId,
        appName: name,
        pluginName: params.pluginName,
        pluginVersion: params.pluginVersion,
        required: booleanValue(value.required),
        manifestPath: toDisplayPath(params.appManifestPath, params.projectPath),
      },
    })
  }

  return resources
}

function mcpServersFromRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {}
  if (isRecord(value.mcpServers)) return value.mcpServers
  if (isRecord(value.servers)) return value.servers
  return value
}

async function collectCodexPluginMcpResources(params: {
  mcpServers: unknown
  mcpManifestPath?: string
  manifestPath: string
  pluginSource: string
  pluginName: string
  pluginVersion?: string
  projectPath?: string
}): Promise<SharedResource[]> {
  const manifestFile =
    params.mcpManifestPath && await pathExists(params.mcpManifestPath)
      ? params.mcpManifestPath
      : params.manifestPath
  const parsed =
    manifestFile === params.mcpManifestPath
      ? await readJsonRecord(manifestFile)
      : isRecord(params.mcpServers)
        ? { mcpServers: params.mcpServers }
        : null
  const servers = mcpServersFromRecord(parsed)
  const resources: SharedResource[] = []

  for (const [serverName, value] of Object.entries(servers)) {
    if (!isRecord(value)) continue
    const config = value as CodexPluginMcpServerConfig
    const command = stringValue(config.command)
    const url = stringValue(config.url)
    const transport = command ? "stdio" : url ? "http" : "unknown"

    resources.push({
      id: resourceId(["codex", "mcp", "plugin", params.pluginSource, serverName]),
      kind: "mcp",
      name: serverName,
      scope: "plugin",
      engine: "codex",
      pluginSource: params.pluginSource,
      path: toDisplayPath(manifestFile, params.projectPath),
      description: stringValue(config.description),
      enabled: booleanValue(config.disabled) === true ? false : true,
      metadata: {
        codexResourceRole: "plugin-mcp-server",
        serverName,
        pluginName: params.pluginName,
        pluginVersion: params.pluginVersion,
        transport,
        command,
        args: stringArrayValue(config.args),
        cwd: stringValue(config.cwd),
        url,
        authType: stringValue(config.authType),
        hasOAuth: Boolean(config._oauth),
        hasEnv: isRecord(config.env) && Object.keys(config.env).length > 0,
        envKeys: stringRecordKeys(config.env),
        approved: booleanValue(config.approved),
        manifestPath: toDisplayPath(manifestFile, params.projectPath),
      },
    })
  }

  return resources
}

function pluginCacheParts(pluginCacheRoot: string, pluginPath: string): {
  marketplace?: string
  slug?: string
  cacheVersion?: string
} {
  const relative = path.relative(pluginCacheRoot, pluginPath)
  if (relative.startsWith("..")) return {}
  const [marketplace, slug, cacheVersion] = relative.split(path.sep)
  return { marketplace, slug, cacheVersion }
}

export async function collectCodexNativeResources(
  params: CollectCodexNativeResourcesParams = {},
): Promise<SharedResource[]> {
  const codexRoot = params.codexRoot ?? path.join(home, ".codex")
  const pluginCacheRoot =
    params.pluginCacheRoot ?? path.join(codexRoot, "plugins", "cache")
  const codexCacheRoot = params.codexCacheRoot ?? path.join(codexRoot, "cache")
  const resources: SharedResource[] = []

  resources.push(
    ...(await collectCodexNativeFiles({
      codexRoot,
      projectPath: params.projectPath,
    })),
    ...(await collectCodexAutomations({
      codexRoot,
      projectPath: params.projectPath,
    })),
    ...(await collectCodexConnectorResources({
      cacheRoot: codexCacheRoot,
      projectPath: params.projectPath,
    })),
    ...(await collectCodexAppsToolsResources({
      cacheRoot: codexCacheRoot,
      projectPath: params.projectPath,
    })),
    ...(await collectCodexRemoteAppResources({
      cacheRoot: codexCacheRoot,
      projectPath: params.projectPath,
    })),
    ...(await scanCodexSkillRoot({
      root: path.join(codexRoot, "skills"),
      scope: "user",
      projectPath: params.projectPath,
    })),
  )

  const manifests = await findCodexPluginManifests(pluginCacheRoot)
  for (const manifestPath of manifests) {
    const pluginPath = path.dirname(path.dirname(manifestPath))
    const manifest = await readCodexPluginManifest(manifestPath)
    if (!manifest) continue

    const interfaceMeta = isRecord(manifest.interface)
      ? (manifest.interface as CodexPluginInterface)
      : {}
    const cacheParts = pluginCacheParts(pluginCacheRoot, pluginPath)
    const manifestName = stringValue(manifest.name) || cacheParts.slug || path.basename(pluginPath)
    const displayName = stringValue(interfaceMeta.displayName) || manifestName
    const version = stringValue(manifest.version) || cacheParts.cacheVersion
    const pluginSource = resourceId([
      "codex",
      cacheParts.marketplace || "cache",
      manifestName,
    ])
    const mcpManifestPath = resolvePluginRelativePath(pluginPath, manifest.mcpServers)
    const appManifestPath = resolvePluginRelativePath(pluginPath, manifest.apps)
    const skillsRoot =
      resolvePluginRelativePath(pluginPath, manifest.skills) ?? path.join(pluginPath, "skills")

    resources.push({
      id: resourceId(["plugin", pluginSource]),
      kind: "plugin",
      name: displayName,
      scope: "plugin",
      engine: "codex",
      pluginSource,
      path: toDisplayPath(pluginPath, params.projectPath),
      description:
        stringValue(interfaceMeta.shortDescription) ||
        stringValue(manifest.description) ||
        stringValue(interfaceMeta.longDescription),
      enabled: true,
      metadata: {
        codexResourceRole: "plugin-manifest",
        manifestName,
        displayName,
        version,
        marketplace: cacheParts.marketplace,
        cacheSlug: cacheParts.slug,
        cacheVersion: cacheParts.cacheVersion,
        category: stringValue(interfaceMeta.category),
        developerName: stringValue(interfaceMeta.developerName),
        homepage: stringValue(manifest.homepage),
        repository: stringValue(manifest.repository),
        keywords: stringArrayValue(manifest.keywords),
        capabilities: stringArrayValue(interfaceMeta.capabilities),
        manifestPath: toDisplayPath(manifestPath, params.projectPath),
        mcpManifestPath:
          mcpManifestPath && await pathExists(mcpManifestPath)
            ? toDisplayPath(mcpManifestPath, params.projectPath)
            : undefined,
        appManifestPath:
          appManifestPath && await pathExists(appManifestPath)
            ? toDisplayPath(appManifestPath, params.projectPath)
            : undefined,
        skillsPath:
          await pathExists(skillsRoot)
            ? toDisplayPath(skillsRoot, params.projectPath)
            : undefined,
      },
    })

    resources.push(
      ...(await scanCodexSkillRoot({
        root: skillsRoot,
        scope: "plugin",
        projectPath: params.projectPath,
        pluginSource,
        pluginName: displayName,
        pluginVersion: version,
      })),
      ...(await collectCodexPluginAppResources({
        appManifestPath,
        pluginSource,
        pluginName: displayName,
        pluginVersion: version,
        projectPath: params.projectPath,
      })),
      ...(await collectCodexPluginMcpResources({
        mcpServers: manifest.mcpServers,
        mcpManifestPath,
        manifestPath,
        pluginSource,
        pluginName: displayName,
        pluginVersion: version,
        projectPath: params.projectPath,
      })),
    )
  }

  return resources
}
