import * as crypto from "crypto"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import type {
  EngineResourceProjection,
  ResourcePathMapping,
} from "../shared-resources/types"

export type MossProjectionMaterializeStatus =
  | "created"
  | "updated"
  | "skipped"
  | "conflict"
  | "unsupported"

export interface MossProjectionMaterializeResult {
  engineId: EngineResourceProjection["engineId"]
  resourceId: string
  action: ResourcePathMapping["action"]
  sourcePath?: string
  targetPath?: string
  status: MossProjectionMaterializeStatus
  reason?: string
}

export interface MossProjectionManifestEntry {
  engineId: EngineResourceProjection["engineId"]
  resourceId: string
  action: ResourcePathMapping["action"]
  sourcePath?: string
  targetPath: string
  contentHash?: string
  updatedAt: string
}

export interface MossProjectionManifest {
  version: 1
  generatedAt: string
  entries: Record<string, MossProjectionManifestEntry>
}

export interface MossProjectionManifestSummary {
  status: "found" | "missing" | "parse-error"
  sourcePath: string
  generatedAt?: string
  totalEntries: number
  engines: Array<{
    engineId: EngineResourceProjection["engineId"]
    entries: number
  }>
  error?: string
}

export interface MaterializeMossProjectionOptions {
  projectPath: string
  projection: EngineResourceProjection
  dryRun?: boolean
}

export interface RemoveMossProjectionResourceOptions {
  projectPath: string
  resourceId: string
  sourcePath?: string
  targetPaths?: string[]
  removeTargets?: boolean
}

export interface RemoveMossProjectionResourceResult {
  removedEntries: string[]
  removedTargets: string[]
}

const MANIFEST_PATH = path.join(".moss", "projections", "manifest.json")
const ADAPTER_MANIFEST_NAME = ".moss-adapter.json"

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

function normalizePathKey(projectPath: string, filePath: string): string {
  const normalizedProjectPath = path.resolve(projectPath)
  const normalizedFilePath = path.resolve(filePath)
  if (
    normalizedFilePath === normalizedProjectPath ||
    normalizedFilePath.startsWith(`${normalizedProjectPath}${path.sep}`)
  ) {
    return path.relative(normalizedProjectPath, normalizedFilePath)
  }
  return normalizedFilePath
}

function resolveProjectionPath(projectPath: string, mappingPath: string): string {
  if (mappingPath.startsWith("~/")) {
    return path.join(os.homedir(), mappingPath.slice(2))
  }
  if (path.isAbsolute(mappingPath)) return mappingPath
  return path.join(projectPath, mappingPath)
}

function hashContent(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

async function readManifest(projectPath: string): Promise<MossProjectionManifest> {
  const manifestPath = path.join(projectPath, MANIFEST_PATH)
  try {
    const raw = await fs.readFile(manifestPath, "utf-8")
    const parsed = JSON.parse(raw) as MossProjectionManifest
    if (parsed?.version === 1 && parsed.entries && typeof parsed.entries === "object") {
      return parsed
    }
  } catch {
    // Fall through to a fresh manifest.
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: {},
  }
}

async function writeManifest(
  projectPath: string,
  manifest: MossProjectionManifest,
): Promise<void> {
  manifest.generatedAt = new Date().toISOString()
  const manifestPath = path.join(projectPath, MANIFEST_PATH)
  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8")
}

function summarizeManifest(
  manifest: MossProjectionManifest,
  sourcePath: string,
): MossProjectionManifestSummary {
  const counts = new Map<EngineResourceProjection["engineId"], number>()
  for (const entry of Object.values(manifest.entries)) {
    counts.set(entry.engineId, (counts.get(entry.engineId) ?? 0) + 1)
  }

  return {
    status: "found",
    sourcePath,
    generatedAt: manifest.generatedAt,
    totalEntries: Object.keys(manifest.entries).length,
    engines: Array.from(counts.entries())
      .map(([engineId, entries]) => ({ engineId, entries }))
      .sort((a, b) => a.engineId.localeCompare(b.engineId)),
  }
}

export async function readMossProjectionManifestSummary(
  projectPath: string,
): Promise<MossProjectionManifestSummary> {
  const manifestPath = path.join(projectPath, MANIFEST_PATH)
  if (!(await pathExists(manifestPath))) {
    return {
      status: "missing",
      sourcePath: manifestPath,
      totalEntries: 0,
      engines: [],
    }
  }

  try {
    const raw = await fs.readFile(manifestPath, "utf-8")
    const parsed = JSON.parse(raw) as MossProjectionManifest
    if (
      parsed?.version !== 1 ||
      !parsed.entries ||
      typeof parsed.entries !== "object"
    ) {
      throw new Error("Projection manifest is not a version 1 Moss manifest.")
    }
    return summarizeManifest(parsed, manifestPath)
  } catch (error) {
    return {
      status: "parse-error",
      sourcePath: manifestPath,
      totalEntries: 0,
      engines: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function removeMossProjectionResource(
  options: RemoveMossProjectionResourceOptions,
): Promise<RemoveMossProjectionResourceResult> {
  const manifestPath = path.join(options.projectPath, MANIFEST_PATH)
  if (!(await pathExists(manifestPath))) {
    return {
      removedEntries: [],
      removedTargets: [],
    }
  }

  const manifest = await readManifest(options.projectPath)
  const sourceKey = options.sourcePath
    ? normalizePathKey(
        options.projectPath,
        resolveProjectionPath(options.projectPath, options.sourcePath),
      )
    : undefined
  const sourceAbs = options.sourcePath
    ? resolveProjectionPath(options.projectPath, options.sourcePath)
    : undefined
  const targetKeys = new Set(
    (options.targetPaths ?? []).map((targetPath) =>
      normalizePathKey(
        options.projectPath,
        resolveProjectionPath(options.projectPath, targetPath),
      ),
    ),
  )
  const removedEntries: string[] = []
  const removedTargets: string[] = []
  const removedTargetKeys = new Set<string>()

  for (const [entryKey, entry] of Object.entries(manifest.entries)) {
    const entryManifestKey = normalizePathKey(
      options.projectPath,
      resolveProjectionPath(options.projectPath, entryKey),
    )
    const entrySourceKey = entry.sourcePath
      ? normalizePathKey(
          options.projectPath,
          resolveProjectionPath(options.projectPath, entry.sourcePath),
        )
      : undefined
    const entryTargetKey = normalizePathKey(
      options.projectPath,
      resolveProjectionPath(options.projectPath, entry.targetPath),
    )
    const matches =
      entry.resourceId === options.resourceId ||
      (sourceKey !== undefined && entrySourceKey === sourceKey) ||
      targetKeys.has(entryTargetKey) ||
      targetKeys.has(entryManifestKey)

    if (!matches) continue

    delete manifest.entries[entryKey]
    removedEntries.push(entryKey)

    if (options.removeTargets && targetKeys.has(entryManifestKey)) {
      await fs.rm(resolveProjectionPath(options.projectPath, entryKey), {
        recursive: true,
        force: true,
      })
      removedTargets.push(entryKey)
      removedTargetKeys.add(entryManifestKey)
    } else if (options.removeTargets && targetKeys.has(entryTargetKey)) {
      await fs.rm(resolveProjectionPath(options.projectPath, entry.targetPath), {
        recursive: true,
        force: true,
      })
      removedTargets.push(entry.targetPath)
      removedTargetKeys.add(entryTargetKey)
    }
  }

  if (options.removeTargets) {
    for (const targetPath of options.targetPaths ?? []) {
      const targetAbs = resolveProjectionPath(options.projectPath, targetPath)
      const targetKey = normalizePathKey(options.projectPath, targetAbs)
      if (removedTargetKeys.has(targetKey)) continue
      if (!(await isRemovableProjectionTarget({
        targetAbs,
        sourceAbs,
        sourcePath: options.sourcePath,
      }))) {
        continue
      }
      await fs.rm(targetAbs, { recursive: true, force: true })
      removedTargets.push(targetPath)
      removedTargetKeys.add(targetKey)
    }
  }

  if (removedEntries.length > 0) {
    await writeManifest(options.projectPath, manifest)
  }

  return {
    removedEntries,
    removedTargets,
  }
}

function canOverwriteTarget(
  targetKey: string,
  manifest: MossProjectionManifest,
): boolean {
  return Boolean(manifest.entries[targetKey])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isEmptyRecord(value: unknown): boolean {
  return isRecord(value) && Object.keys(value).length === 0
}

function isAdoptableEmptyMcpBridge(value: unknown): boolean {
  if (!isRecord(value)) return false

  const entries = Object.entries(value)
  if (entries.length === 0) return true

  return entries.every(([key, entryValue]) => {
    if (key !== "mcpServers" && key !== "servers") return false
    return isEmptyRecord(entryValue)
  })
}

function isAdoptableMossGeneratedBridge(value: unknown): boolean {
  if (!isRecord(value)) return false
  const moss = value.moss
  if (!isRecord(moss)) return false
  return moss.generated === true && Array.isArray(moss.sources)
}

function isAdoptableMossAdapterManifest(value: unknown): boolean {
  if (!isRecord(value)) return false
  return value.version === 1 &&
    value.generatedBy === "moss" &&
    Array.isArray(value.resources)
}

async function canAdoptExistingTarget(params: {
  targetAbs: string
  targetKey: string
}): Promise<boolean> {
  try {
    const stat = await fs.lstat(params.targetAbs)
    if (!stat.isFile()) return false
    const raw = await fs.readFile(params.targetAbs, "utf-8")
    const parsed = JSON.parse(raw)
    if (params.targetKey === ".mcp.json" && isAdoptableEmptyMcpBridge(parsed)) {
      return true
    }
    return isAdoptableMossGeneratedBridge(parsed) ||
      isAdoptableMossAdapterManifest(parsed)
  } catch {
    return false
  }
}

async function readLinkTarget(filePath: string): Promise<string | null> {
  try {
    return await fs.readlink(filePath)
  } catch {
    return null
  }
}

async function isSameSymlinkTarget(
  linkPath: string,
  sourcePath: string,
): Promise<boolean> {
  const existingTarget = await readLinkTarget(linkPath)
  if (!existingTarget) return false
  const resolvedExisting = path.resolve(path.dirname(linkPath), existingTarget)
  return resolvedExisting === path.resolve(sourcePath)
}

async function isRemovableProjectionTarget(params: {
  targetAbs: string
  sourceAbs?: string
  sourcePath?: string
}): Promise<boolean> {
  try {
    const stat = await fs.lstat(params.targetAbs)
    if (stat.isSymbolicLink()) {
      if (!params.sourceAbs) return true
      return isSameSymlinkTarget(params.targetAbs, params.sourceAbs)
    }
    if (!stat.isFile()) return false
    const raw = await fs.readFile(params.targetAbs, "utf-8")
    const parsed = JSON.parse(raw) as {
      moss?: {
        generated?: boolean
        sources?: string[]
      }
    }
    if (parsed.moss?.generated !== true) return false
    if (!params.sourcePath) return true
    return Array.isArray(parsed.moss.sources) && parsed.moss.sources.includes(params.sourcePath)
  } catch {
    return false
  }
}

async function ensureWritableTarget(
  params: {
    targetAbs: string
    targetKey: string
    manifest: MossProjectionManifest
    dryRun?: boolean
  },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!(await pathExists(params.targetAbs))) return { ok: true }
  if (canOverwriteTarget(params.targetKey, params.manifest)) return { ok: true }
  if (await canAdoptExistingTarget(params)) return { ok: true }

  return {
    ok: false,
    reason: "Target exists and is not managed by Moss projection manifest.",
  }
}

async function materializeSymlink(params: {
  projectPath: string
  engineId: EngineResourceProjection["engineId"]
  mapping: ResourcePathMapping
  manifest: MossProjectionManifest
  dryRun?: boolean
}): Promise<MossProjectionMaterializeResult> {
  if (!params.mapping.sourcePath || !params.mapping.targetPath) {
    return {
      engineId: params.engineId,
      resourceId: params.mapping.resourceId,
      action: params.mapping.action,
      status: "unsupported",
      reason: "Symlink projection requires sourcePath and targetPath.",
    }
  }

  const sourceAbs = resolveProjectionPath(params.projectPath, params.mapping.sourcePath)
  const targetAbs = resolveProjectionPath(params.projectPath, params.mapping.targetPath)
  const targetKey = normalizePathKey(params.projectPath, targetAbs)

  if (!(await pathExists(sourceAbs))) {
    return {
      engineId: params.engineId,
      resourceId: params.mapping.resourceId,
      action: "symlink",
      sourcePath: params.mapping.sourcePath,
      targetPath: params.mapping.targetPath,
      status: "conflict",
      reason: "Source path does not exist.",
    }
  }

  if (await isSameSymlinkTarget(targetAbs, sourceAbs)) {
    const wasManaged = canOverwriteTarget(targetKey, params.manifest)
    if (!params.dryRun && !wasManaged) {
      params.manifest.entries[targetKey] = {
        engineId: params.engineId,
        resourceId: params.mapping.resourceId,
        action: "symlink",
        sourcePath: params.mapping.sourcePath,
        targetPath: params.mapping.targetPath,
        updatedAt: new Date().toISOString(),
      }
    }
    return {
      engineId: params.engineId,
      resourceId: params.mapping.resourceId,
      action: "symlink",
      sourcePath: params.mapping.sourcePath,
      targetPath: params.mapping.targetPath,
      status: wasManaged ? "skipped" : "updated",
      reason: wasManaged
        ? "Symlink already points at the Moss source."
        : "Existing symlink points at the Moss source and was adopted by the projection manifest.",
    }
  }

  const writable = await ensureWritableTarget({
    targetAbs,
    targetKey,
      manifest: params.manifest,
      dryRun: params.dryRun,
  })
  if (!writable.ok) {
    return {
      engineId: params.engineId,
      resourceId: params.mapping.resourceId,
      action: "symlink",
      sourcePath: params.mapping.sourcePath,
      targetPath: params.mapping.targetPath,
      status: "conflict",
      reason: writable.reason,
    }
  }

  let sourceStat
  try {
    sourceStat = await fs.stat(sourceAbs)
  } catch {
    return {
      engineId: params.engineId,
      resourceId: params.mapping.resourceId,
      action: "symlink",
      sourcePath: params.mapping.sourcePath,
      targetPath: params.mapping.targetPath,
      status: "conflict",
      reason: "Unable to stat source path.",
    }
  }

  const wasManaged = canOverwriteTarget(targetKey, params.manifest)
  const targetAlreadyExists = await pathExists(targetAbs)

  if (!params.dryRun) {
    await fs.mkdir(path.dirname(targetAbs), { recursive: true })
    if (targetAlreadyExists) {
      await fs.rm(targetAbs, { recursive: true, force: true })
    }
    const type = sourceStat.isDirectory()
      ? process.platform === "win32" ? "junction" : "dir"
      : "file"
    await fs.symlink(sourceAbs, targetAbs, type)
    params.manifest.entries[targetKey] = {
      engineId: params.engineId,
      resourceId: params.mapping.resourceId,
      action: "symlink",
      sourcePath: params.mapping.sourcePath,
      targetPath: params.mapping.targetPath,
      updatedAt: new Date().toISOString(),
    }
  }

  return {
    engineId: params.engineId,
    resourceId: params.mapping.resourceId,
    action: "symlink",
    sourcePath: params.mapping.sourcePath,
    targetPath: params.mapping.targetPath,
    status: wasManaged || targetAlreadyExists ? "updated" : "created",
  }
}

function quoteTomlString(value: string): string {
  return JSON.stringify(value)
}

function appendTomlValue(lines: string[], key: string, value: unknown): void {
  if (typeof value === "string") {
    lines.push(`${key} = ${quoteTomlString(value)}`)
    return
  }
  if (typeof value === "boolean" || typeof value === "number") {
    lines.push(`${key} = ${String(value)}`)
    return
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    lines.push(`${key} = [${value.map(quoteTomlString).join(", ")}]`)
  }
}

async function readMcpServers(sourceAbs: string): Promise<Record<string, any>> {
  const raw = await fs.readFile(sourceAbs, "utf-8")
  const parsed = JSON.parse(raw) as {
    mcpServers?: Record<string, any>
    servers?: Record<string, any>
  }
  return parsed.mcpServers ?? parsed.servers ?? {}
}

async function buildCodexTomlBridge(
  projectPath: string,
  mappings: ResourcePathMapping[],
): Promise<string> {
  const lines = [
    "# Generated by Moss from .moss Unified Source.",
    "# Do not edit this file directly; update .moss instead.",
    "",
  ]

  const mcpMappings = mappings.filter((mapping) =>
    mapping.sourcePath?.endsWith(path.join(".moss", "mcp", "config.json")) ||
    mapping.sourcePath?.endsWith(".moss/mcp/config.json"),
  )
  const seenMcpSources = new Set<string>()
  for (const mapping of mcpMappings) {
    if (!mapping.sourcePath) continue
    if (seenMcpSources.has(mapping.sourcePath)) continue
    seenMcpSources.add(mapping.sourcePath)
    const sourceAbs = resolveProjectionPath(projectPath, mapping.sourcePath)
    const servers = await readMcpServers(sourceAbs)
    for (const [serverName, serverConfig] of Object.entries(servers)) {
      const config = serverConfig && typeof serverConfig === "object"
        ? serverConfig as Record<string, unknown>
        : {}
      lines.push(`[mcp_servers.${serverName}]`)
      appendTomlValue(lines, "command", config.command)
      appendTomlValue(lines, "url", config.url)
      appendTomlValue(lines, "args", config.args)
      if (config.env && typeof config.env === "object" && !Array.isArray(config.env)) {
        lines.push("")
        lines.push(`[mcp_servers.${serverName}.env]`)
        for (const [envKey, envValue] of Object.entries(config.env)) {
          appendTomlValue(lines, envKey, envValue)
        }
      }
      lines.push("")
    }
  }

  const providerMappings = mappings.filter((mapping) =>
    mapping.sourcePath?.endsWith(path.join(".moss", "providers.yaml")) ||
    mapping.sourcePath?.endsWith(".moss/providers.yaml"),
  )
  const seenProviderSources = new Set<string>()
  for (const mapping of providerMappings) {
    if (!mapping.sourcePath) continue
    if (seenProviderSources.has(mapping.sourcePath)) continue
    seenProviderSources.add(mapping.sourcePath)
    lines.push(`# Moss provider routing source: ${mapping.sourcePath}`)
  }

  return `${lines.join("\n").trimEnd()}\n`
}

async function buildManagedBridgeContent(
  projectPath: string,
  targetAbs: string,
  mappings: ResourcePathMapping[],
): Promise<string> {
  const targetName = path.basename(targetAbs)
  const firstSourcePath = mappings.find((mapping) => mapping.sourcePath)?.sourcePath
  const firstSourceAbs = firstSourcePath
    ? resolveProjectionPath(projectPath, firstSourcePath)
    : undefined

  if (targetName === ".mcp.json" && firstSourceAbs) {
    const raw = await fs.readFile(firstSourceAbs, "utf-8")
    const parsed = JSON.parse(raw)
    return `${JSON.stringify(parsed, null, 2)}\n`
  }

  if (targetName.endsWith(".toml")) {
    return buildCodexTomlBridge(projectPath, mappings)
  }

  return `${JSON.stringify({
    moss: {
      generated: true,
      sources: mappings.map((mapping) => mapping.sourcePath).filter(Boolean),
      note: "Generated by Moss from .moss Unified Source. Update .moss instead.",
    },
  }, null, 2)}\n`
}

async function materializeManagedBridge(params: {
  projectPath: string
  projection: EngineResourceProjection
  mappings: ResourcePathMapping[]
  targetPath: string
  manifest: MossProjectionManifest
  dryRun?: boolean
}): Promise<MossProjectionMaterializeResult[]> {
  const targetAbs = resolveProjectionPath(params.projectPath, params.targetPath)
  const targetKey = normalizePathKey(params.projectPath, targetAbs)
  const wasManaged = canOverwriteTarget(targetKey, params.manifest)
  const targetAlreadyExists = await pathExists(targetAbs)
  const writable = await ensureWritableTarget({
    targetAbs,
    targetKey,
    manifest: params.manifest,
    dryRun: params.dryRun,
  })

  if (!writable.ok) {
    return params.mappings.map((mapping) => ({
      engineId: params.projection.engineId,
      resourceId: mapping.resourceId,
      action: mapping.action,
      sourcePath: mapping.sourcePath,
      targetPath: mapping.targetPath,
      status: "conflict",
      reason: writable.reason,
    }))
  }

  const content = await buildManagedBridgeContent(
    params.projectPath,
    targetAbs,
    params.mappings,
  )
  const contentHash = hashContent(content)

  if (!params.dryRun) {
    await fs.mkdir(path.dirname(targetAbs), { recursive: true })
    await fs.writeFile(targetAbs, content, "utf-8")
  }

  const now = new Date().toISOString()
  for (const mapping of params.mappings) {
    params.manifest.entries[targetKey] = {
      engineId: params.projection.engineId,
      resourceId: mapping.resourceId,
      action: "managed-bridge",
      sourcePath: mapping.sourcePath,
      targetPath: params.targetPath,
      contentHash,
      updatedAt: now,
    }
  }

  const status = wasManaged || targetAlreadyExists ? "updated" : "created"
  return params.mappings.map((mapping) => ({
    engineId: params.projection.engineId,
    resourceId: mapping.resourceId,
    action: "managed-bridge",
    sourcePath: mapping.sourcePath,
    targetPath: params.targetPath,
    status,
  }))
}

async function materializeAdapterInjection(params: {
  projectPath: string
  projection: EngineResourceProjection
  mappings: ResourcePathMapping[]
  targetPath: string
  manifest: MossProjectionManifest
  dryRun?: boolean
}): Promise<MossProjectionMaterializeResult[]> {
  const targetAbs = resolveProjectionPath(params.projectPath, params.targetPath)
  const adapterManifestAbs = path.join(targetAbs, ADAPTER_MANIFEST_NAME)
  const adapterManifestKey = normalizePathKey(params.projectPath, adapterManifestAbs)
  const wasManaged = canOverwriteTarget(adapterManifestKey, params.manifest)
  const adapterManifestAlreadyExists = await pathExists(adapterManifestAbs)

  try {
    const stat = await fs.stat(targetAbs)
    if (!stat.isDirectory()) {
      return params.mappings.map((mapping) => ({
        engineId: params.projection.engineId,
        resourceId: mapping.resourceId,
        action: mapping.action,
        sourcePath: mapping.sourcePath,
        targetPath: mapping.targetPath,
        status: "conflict",
        reason: "Adapter injection target exists and is not a directory.",
      }))
    }
  } catch {
    // Directory will be created below.
  }

  const writable = await ensureWritableTarget({
    targetAbs: adapterManifestAbs,
    targetKey: adapterManifestKey,
    manifest: params.manifest,
    dryRun: params.dryRun,
  })

  if (!writable.ok) {
    return params.mappings.map((mapping) => ({
      engineId: params.projection.engineId,
      resourceId: mapping.resourceId,
      action: mapping.action,
      sourcePath: mapping.sourcePath,
      targetPath: mapping.targetPath,
      status: "conflict",
      reason: writable.reason,
    }))
  }

  const content = `${JSON.stringify({
    version: 1,
    engineId: params.projection.engineId,
    generatedBy: "moss",
    resources: params.mappings.map((mapping) => ({
      resourceId: mapping.resourceId,
      sourcePath: mapping.sourcePath,
      targetPath: mapping.targetPath,
      reason: mapping.reason,
    })),
  }, null, 2)}\n`
  const contentHash = hashContent(content)

  if (!params.dryRun) {
    await fs.mkdir(targetAbs, { recursive: true })
    await fs.writeFile(adapterManifestAbs, content, "utf-8")
  }

  const now = new Date().toISOString()
  for (const mapping of params.mappings) {
    params.manifest.entries[adapterManifestKey] = {
      engineId: params.projection.engineId,
      resourceId: mapping.resourceId,
      action: "adapter-inject",
      sourcePath: mapping.sourcePath,
      targetPath: params.targetPath,
      contentHash,
      updatedAt: now,
    }
  }

  const status = wasManaged || adapterManifestAlreadyExists ? "updated" : "created"
  return params.mappings.map((mapping) => ({
    engineId: params.projection.engineId,
    resourceId: mapping.resourceId,
    action: "adapter-inject",
    sourcePath: mapping.sourcePath,
    targetPath: params.targetPath,
    status,
  }))
}

function groupByTarget(
  mappings: ResourcePathMapping[],
): Map<string, ResourcePathMapping[]> {
  const groups = new Map<string, ResourcePathMapping[]>()
  for (const mapping of mappings) {
    if (!mapping.targetPath) continue
    const group = groups.get(mapping.targetPath) ?? []
    group.push(mapping)
    groups.set(mapping.targetPath, group)
  }
  return groups
}

export async function materializeMossProjection(
  options: MaterializeMossProjectionOptions,
): Promise<MossProjectionMaterializeResult[]> {
  const manifest = await readManifest(options.projectPath)
  const results: MossProjectionMaterializeResult[] = []

  const symlinks = options.projection.mappings.filter(
    (mapping) => mapping.action === "symlink",
  )
  for (const mapping of symlinks) {
    const result = await materializeSymlink({
      projectPath: options.projectPath,
      engineId: options.projection.engineId,
      mapping,
      manifest,
      dryRun: options.dryRun,
    })
    results.push(result)
  }

  const managedBridgeGroups = groupByTarget(
    options.projection.mappings.filter(
      (mapping) => mapping.action === "managed-bridge",
    ),
  )
  for (const [targetPath, mappings] of managedBridgeGroups) {
    results.push(
      ...(await materializeManagedBridge({
        projectPath: options.projectPath,
        projection: options.projection,
        mappings,
        targetPath,
        manifest,
        dryRun: options.dryRun,
      })),
    )
  }

  const adapterInjectionGroups = groupByTarget(
    options.projection.mappings.filter(
      (mapping) => mapping.action === "adapter-inject",
    ),
  )
  for (const [targetPath, mappings] of adapterInjectionGroups) {
    results.push(
      ...(await materializeAdapterInjection({
        projectPath: options.projectPath,
        projection: options.projection,
        mappings,
        targetPath,
        manifest,
        dryRun: options.dryRun,
      })),
    )
  }

  for (const mapping of options.projection.mappings) {
    if (
      mapping.action === "symlink" ||
      mapping.action === "managed-bridge" ||
      mapping.action === "adapter-inject"
    ) {
      continue
    }
    results.push({
      engineId: options.projection.engineId,
      resourceId: mapping.resourceId,
      action: mapping.action,
      sourcePath: mapping.sourcePath,
      targetPath: mapping.targetPath,
      status: mapping.action === "native" ? "skipped" : "unsupported",
      reason: mapping.reason,
    })
  }

  if (!options.dryRun) {
    await writeManifest(options.projectPath, manifest)
  }

  return results
}
