import * as fs from "fs/promises"
import * as path from "path"
import type { Dirent } from "fs"
import { createHash } from "crypto"
import { buildPluginManifestReviewDocument } from "../../../shared/plugin-update-review"
import { getControlledUiPluginTargetMode, getDeveloperTrustedPluginTargetMode } from "../../../shared/plugin-target-modes"
import type { PluginTargetModeSummary } from "../../../shared/plugin-target-modes"
import {
  buildControlledUiReviewDocument,
  parseControlledUiManifest,
  type PluginControlledUiDiagnostic,
  type PluginControlledUiManifest,
  type PluginControlledUiReviewDocument,
} from "../../../shared/plugin-controlled-ui"
import {
  buildDeveloperTrustedReviewDocument,
  parseDeveloperTrustedManifest,
  type PluginDeveloperTrustedDiagnostic,
  type PluginDeveloperTrustedManifest,
  type PluginDeveloperTrustedReviewDocument,
} from "../../../shared/plugin-developer-trusted"
import type { PluginInfo } from "."
import { resolveDirentType } from "../fs/dirent"
import { parseMarkdownFrontmatter } from "../markdown/frontmatter"

export interface PluginComponent {
  name: string
  description?: string
}

export interface PluginDeclaredComponents {
  commands: PluginComponent[]
  skills: PluginComponent[]
  agents: PluginComponent[]
  hooks: PluginComponent[]
  mcpServers: string[]
}

export interface ScannedPluginReviewDocument {
  components: PluginDeclaredComponents
  targetModeSummary: PluginTargetModeSummary
  controlledUi: {
    manifest?: PluginControlledUiManifest
    reviewDocument: PluginControlledUiReviewDocument
    diagnostics: PluginControlledUiDiagnostic[]
    ignoredUnknownFields: string[]
    manifestPath?: string
  }
  developerTrusted: {
    manifest?: PluginDeveloperTrustedManifest
    reviewDocument: PluginDeveloperTrustedReviewDocument
    diagnostics: PluginDeveloperTrustedDiagnostic[]
    ignoredUnknownFields: string[]
    manifestPath?: string
    entryPath?: string
    entryRealPath?: string
    entryContentHash?: string
    bundleContentHash?: string
    bundleFileCount?: number
    bundleByteCount?: number
  }
  reviewDocument: ReturnType<typeof buildPluginManifestReviewDocument>
}

const CONTROLLED_UI_MANIFEST_RELATIVE_PATH = path.join(".locus-plugin", "ui.json")
const DEVELOPER_MANIFEST_RELATIVE_PATH = path.join(".locus-plugin", "developer.json")
const MAX_CONTROLLED_UI_MANIFEST_BYTES = 64 * 1024
const MAX_DEVELOPER_MANIFEST_BYTES = 64 * 1024
const MAX_DEVELOPER_ENTRY_BYTES = 2 * 1024 * 1024
const MAX_DEVELOPER_BUNDLE_BYTES = 4 * 1024 * 1024
const MAX_DEVELOPER_BUNDLE_FILES = 128
const DEVELOPER_BUNDLE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".json",
  ".mjs",
  ".mts",
  ".node",
  ".ts",
  ".tsx",
  ".wasm",
])
const DEVELOPER_BUNDLE_ROOT_FILES = [
  "bun.lock",
  "bun.lockb",
  "package-lock.json",
  "package.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]
const DEVELOPER_BUNDLE_SKIP_DIRS = new Set([
  ".git",
  ".locus-plugin",
  "node_modules",
])

function getPluginComponentPaths(plugin: PluginInfo) {
  return {
    commands: plugin.componentPaths?.commands ?? path.join(plugin.path, "commands"),
    skills: plugin.componentPaths?.skills ?? path.join(plugin.path, "skills"),
    agents: plugin.componentPaths?.agents ?? path.join(plugin.path, "agents"),
    hooks: plugin.componentPaths?.hooks ?? path.join(plugin.path, "hooks.json"),
    mcpServers: plugin.componentPaths?.mcpServers ?? path.join(plugin.path, ".mcp.json"),
  }
}

function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

async function scanPluginCommands(dir: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []

  try {
    await fs.access(dir)
  } catch {
    return components
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) continue

      const fullPath = path.join(dir, entry.name)
      const { isDirectory, isFile } = await resolveDirentType(dir, entry)

      if (isDirectory) {
        components.push(...await scanPluginCommands(fullPath))
      } else if (isFile && entry.name.endsWith(".md")) {
        try {
          const content = await fs.readFile(fullPath, "utf-8")
          const { data } = parseMarkdownFrontmatter(content)
          const baseName = entry.name.replace(/\.md$/, "")
          components.push({
            name: typeof data.name === "string" ? data.name : baseName,
            description:
              typeof data.description === "string" ? data.description : undefined,
          })
        } catch {
          // Skip files that cannot be read as command metadata.
        }
      }
    }
  } catch {
    // Directory read failed.
  }

  return components
}

async function scanPluginSkills(dir: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []

  try {
    await fs.access(dir)
  } catch {
    return components
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!isValidEntryName(entry.name)) continue

      const { isDirectory } = await resolveDirentType(dir, entry)
      if (!isDirectory) continue

      const skillMdPath = path.join(dir, entry.name, "SKILL.md")
      try {
        const content = await fs.readFile(skillMdPath, "utf-8")
        const { data } = parseMarkdownFrontmatter(content)
        components.push({
          name: typeof data.name === "string" ? data.name : entry.name,
          description:
            typeof data.description === "string" ? data.description : undefined,
        })
      } catch {
        // Skill directory does not expose SKILL.md metadata.
      }
    }
  } catch {
    // Directory read failed.
  }

  return components
}

async function scanPluginAgents(dir: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []

  try {
    await fs.access(dir)
  } catch {
    return components
  }

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.name.endsWith(".md") || !isValidEntryName(entry.name)) continue

      const { isFile } = await resolveDirentType(dir, entry)
      if (!isFile) continue

      const fullPath = path.join(dir, entry.name)
      try {
        const content = await fs.readFile(fullPath, "utf-8")
        const { data } = parseMarkdownFrontmatter(content)
        const baseName = entry.name.replace(/\.md$/, "")
        components.push({
          name: typeof data.name === "string" ? data.name : baseName,
          description:
            typeof data.description === "string" ? data.description : undefined,
        })
      } catch {
        // Skip unreadable agent metadata.
      }
    }
  } catch {
    // Directory read failed.
  }

  return components
}

async function scanPluginMcpServers(mcpJsonPath: string): Promise<string[]> {
  try {
    await fs.access(mcpJsonPath)
  } catch {
    return []
  }

  try {
    const content = await fs.readFile(mcpJsonPath, "utf-8")
    const parsed = JSON.parse(content) as Record<string, unknown>
    const serversObj =
      parsed.mcpServers &&
      typeof parsed.mcpServers === "object" &&
      !Array.isArray(parsed.mcpServers)
        ? (parsed.mcpServers as Record<string, unknown>)
        : parsed

    return Object.entries(serversObj)
      .filter(([, config]) => config && typeof config === "object" && !Array.isArray(config))
      .map(([name]) => name)
  } catch {
    return []
  }
}

async function scanPluginHooks(hooksPath: string): Promise<PluginComponent[]> {
  const components: PluginComponent[] = []
  const targetPath = await resolveHookPath(hooksPath)
  if (!targetPath) return components

  try {
    const stat = await fs.stat(targetPath)
    if (stat.isDirectory()) {
      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      for (const entry of entries) {
        if (!isValidEntryName(entry.name)) continue
        const { isDirectory, isFile } = await resolveDirentType(
          targetPath,
          entry,
        )
        if (!isDirectory && !isFile) continue
        const baseName = entry.name.replace(/\.(json|md|ya?ml|sh)$/i, "")
        components.push({ name: baseName })
      }
      return components.sort((a, b) => a.name.localeCompare(b.name))
    }

    if (!stat.isFile() || !targetPath.endsWith(".json")) return components
    const parsed = JSON.parse(await fs.readFile(targetPath, "utf-8")) as unknown
    return scanPluginHooksJson(parsed)
  } catch {
    return components
  }
}

async function resolveHookPath(hooksPath: string): Promise<string | undefined> {
  try {
    await fs.access(hooksPath)
    return hooksPath
  } catch {
    if (path.basename(hooksPath) !== "hooks.json") return undefined
    const hooksDir = path.join(path.dirname(hooksPath), "hooks")
    try {
      await fs.access(hooksDir)
      return hooksDir
    } catch {
      return undefined
    }
  }
}

function scanPluginHooksJson(parsed: unknown): PluginComponent[] {
  const root = getRecordField(parsed, "hooks") ?? toRecord(parsed)
  if (!root) return []

  const components: PluginComponent[] = []
  for (const [eventName, groups] of Object.entries(root)) {
    if (!Array.isArray(groups)) continue
    groups.forEach((group, groupIndex) => {
      const groupRecord = toRecord(group)
      const matcher = getStringField(groupRecord, "matcher")
      const hooks = getArrayField(groupRecord, "hooks")
      const hookEntries = hooks.length > 0 ? hooks : [group]
      hookEntries.forEach((hook, hookIndex) => {
        const hookRecord = toRecord(hook)
        const hookType = getStringField(hookRecord, "type")
        components.push({
          name: [
            eventName,
            matcher,
            hookType,
            hookEntries.length > 1 ? String(hookIndex + 1) : undefined,
          ]
            .filter(Boolean)
            .join(":"),
          description:
            matcher ?? (groupIndex > 0 ? `group ${groupIndex + 1}` : undefined),
        })
      })
    })
  }

  return components.sort((a, b) => a.name.localeCompare(b.name))
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function getRecordField(
  value: unknown,
  key: string,
): Record<string, unknown> | undefined {
  const record = toRecord(value)
  return toRecord(record?.[key])
}

function getArrayField(
  value: Record<string, unknown> | undefined,
  key: string,
): unknown[] {
  const candidate = value?.[key]
  return Array.isArray(candidate) ? candidate : []
}

function getStringField(
  value: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const candidate = value?.[key]
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : undefined
}

async function scanControlledUiManifest(pluginRoot: string): Promise<ScannedPluginReviewDocument["controlledUi"]> {
  const manifestPath = path.join(pluginRoot, CONTROLLED_UI_MANIFEST_RELATIVE_PATH)

  try {
    const [realRoot, realManifestPath] = await Promise.all([
      fs.realpath(pluginRoot),
      fs.realpath(manifestPath),
    ])
    if (!isPathInside(realRoot, realManifestPath)) {
      const diagnostics: PluginControlledUiDiagnostic[] = [{
        code: "controlled-ui-unsafe-field",
        severity: "blocked",
        path: CONTROLLED_UI_MANIFEST_RELATIVE_PATH,
        message: "Controlled UI manifest path escapes the plugin root.",
      }]
      return {
        reviewDocument: buildControlledUiReviewDocument({
          diagnostics,
          ignoredUnknownFields: [],
        }),
        diagnostics,
        ignoredUnknownFields: [],
        manifestPath,
      }
    }
  } catch {
    return {
      reviewDocument: buildControlledUiReviewDocument({
        diagnostics: [],
        ignoredUnknownFields: [],
      }),
      diagnostics: [],
      ignoredUnknownFields: [],
    }
  }

  try {
    const stat = await fs.stat(manifestPath)
    if (!stat.isFile()) {
      const diagnostics: PluginControlledUiDiagnostic[] = [{
        code: "controlled-ui-manifest-invalid",
        severity: "blocked",
        path: CONTROLLED_UI_MANIFEST_RELATIVE_PATH,
        message: "Controlled UI manifest path must be a file.",
      }]
      return {
        reviewDocument: buildControlledUiReviewDocument({
          diagnostics,
          ignoredUnknownFields: [],
        }),
        diagnostics,
        ignoredUnknownFields: [],
        manifestPath,
      }
    }
    if (stat.size > MAX_CONTROLLED_UI_MANIFEST_BYTES) {
      const diagnostics: PluginControlledUiDiagnostic[] = [{
        code: "controlled-ui-limit-exceeded",
        severity: "blocked",
        path: CONTROLLED_UI_MANIFEST_RELATIVE_PATH,
        message: `Controlled UI manifest must be ${MAX_CONTROLLED_UI_MANIFEST_BYTES} bytes or less.`,
      }]
      return {
        reviewDocument: buildControlledUiReviewDocument({
          diagnostics,
          ignoredUnknownFields: [],
        }),
        diagnostics,
        ignoredUnknownFields: [],
        manifestPath,
      }
    }

    const content = await fs.readFile(manifestPath, "utf-8")
    const parsed = parseControlledUiManifest(JSON.parse(content) as unknown)
    return {
      manifest: parsed.manifest,
      reviewDocument: buildControlledUiReviewDocument(parsed),
      diagnostics: parsed.diagnostics,
      ignoredUnknownFields: parsed.ignoredUnknownFields,
      manifestPath,
    }
  } catch (error) {
    const diagnostics: PluginControlledUiDiagnostic[] = [{
      code: "controlled-ui-manifest-invalid",
      severity: "blocked",
      path: CONTROLLED_UI_MANIFEST_RELATIVE_PATH,
      message: error instanceof SyntaxError
        ? "Controlled UI manifest must be valid JSON."
        : "Controlled UI manifest could not be read.",
    }]
    return {
      reviewDocument: buildControlledUiReviewDocument({
        diagnostics,
        ignoredUnknownFields: [],
      }),
      diagnostics,
      ignoredUnknownFields: [],
      manifestPath,
    }
  }
}

async function scanDeveloperTrustedManifest(pluginRoot: string): Promise<ScannedPluginReviewDocument["developerTrusted"]> {
  const manifestPath = path.join(pluginRoot, DEVELOPER_MANIFEST_RELATIVE_PATH)

  try {
    const [realRoot, realManifestPath] = await Promise.all([
      fs.realpath(pluginRoot),
      fs.realpath(manifestPath),
    ])
    if (!isPathInside(realRoot, realManifestPath)) {
      const diagnostics: PluginDeveloperTrustedDiagnostic[] = [{
        code: "developer-entry-outside-root",
        severity: "blocked",
        path: DEVELOPER_MANIFEST_RELATIVE_PATH,
        message: "Developer plugin manifest path escapes the plugin root.",
      }]
      return buildDeveloperScanResult({ diagnostics, manifestPath })
    }
  } catch {
    return buildDeveloperScanResult({ diagnostics: [] })
  }

  try {
    const stat = await fs.stat(manifestPath)
    if (!stat.isFile()) {
      const diagnostics: PluginDeveloperTrustedDiagnostic[] = [{
        code: "developer-manifest-invalid",
        severity: "blocked",
        path: DEVELOPER_MANIFEST_RELATIVE_PATH,
        message: "Developer plugin manifest path must be a file.",
      }]
      return buildDeveloperScanResult({ diagnostics, manifestPath })
    }
    if (stat.size > MAX_DEVELOPER_MANIFEST_BYTES) {
      const diagnostics: PluginDeveloperTrustedDiagnostic[] = [{
        code: "developer-manifest-limit-exceeded",
        severity: "blocked",
        path: DEVELOPER_MANIFEST_RELATIVE_PATH,
        message: `Developer plugin manifest must be ${MAX_DEVELOPER_MANIFEST_BYTES} bytes or less.`,
      }]
      return buildDeveloperScanResult({ diagnostics, manifestPath })
    }

    const content = await fs.readFile(manifestPath, "utf-8")
    const parsed = parseDeveloperTrustedManifest(JSON.parse(content) as unknown)
    if (!parsed.manifest) {
      return buildDeveloperScanResult({
        diagnostics: parsed.diagnostics,
        ignoredUnknownFields: parsed.ignoredUnknownFields,
        manifestPath,
      })
    }

    const entryScan = await scanDeveloperEntry(pluginRoot, parsed.manifest.entry)
    const bundleScan = entryScan.entryRealPath
      ? await scanDeveloperBundle(pluginRoot, entryScan.entryRealPath)
      : { diagnostics: [] }
    const diagnostics = [
      ...parsed.diagnostics,
      ...entryScan.diagnostics,
      ...bundleScan.diagnostics,
    ]
    return {
      manifest: parsed.manifest,
      reviewDocument: buildDeveloperTrustedReviewDocument({
        parseResult: {
          manifest: parsed.manifest,
          diagnostics,
          ignoredUnknownFields: parsed.ignoredUnknownFields,
        },
        entryContentHash: entryScan.entryContentHash,
        entryRealPath: entryScan.entryRealPath,
        bundleContentHash: bundleScan.bundleContentHash,
        bundleFileCount: bundleScan.bundleFileCount,
        bundleByteCount: bundleScan.bundleByteCount,
      }),
      diagnostics,
      ignoredUnknownFields: parsed.ignoredUnknownFields,
      manifestPath,
      entryPath: entryScan.entryPath,
      entryRealPath: entryScan.entryRealPath,
      entryContentHash: entryScan.entryContentHash,
      bundleContentHash: bundleScan.bundleContentHash,
      bundleFileCount: bundleScan.bundleFileCount,
      bundleByteCount: bundleScan.bundleByteCount,
    }
  } catch (error) {
    const diagnostics: PluginDeveloperTrustedDiagnostic[] = [{
      code: "developer-manifest-invalid",
      severity: "blocked",
      path: DEVELOPER_MANIFEST_RELATIVE_PATH,
      message: error instanceof SyntaxError
        ? "Developer plugin manifest must be valid JSON."
        : "Developer plugin manifest could not be read.",
    }]
    return buildDeveloperScanResult({ diagnostics, manifestPath })
  }
}

async function scanDeveloperEntry(
  pluginRoot: string,
  entry: string,
): Promise<{
  entryPath?: string
  entryRealPath?: string
  entryContentHash?: string
  diagnostics: PluginDeveloperTrustedDiagnostic[]
}> {
  const entryPath = path.resolve(pluginRoot, entry)
  if (!isPathInside(pluginRoot, entryPath)) {
    return {
      entryPath,
      diagnostics: [{
        code: "developer-entry-outside-root",
        severity: "blocked",
        path: "entry",
        message: "Developer plugin entry path escapes the plugin root.",
      }],
    }
  }

  try {
    const [realRoot, realEntryPath] = await Promise.all([
      fs.realpath(pluginRoot),
      fs.realpath(entryPath),
    ])
    if (!isPathInside(realRoot, realEntryPath)) {
      return {
        entryPath,
        entryRealPath: realEntryPath,
        diagnostics: [{
          code: "developer-entry-outside-root",
          severity: "blocked",
          path: "entry",
          message: "Developer plugin entry realpath escapes the plugin root.",
        }],
      }
    }

    const stat = await fs.stat(realEntryPath)
    if (!stat.isFile()) {
      return {
        entryPath,
        entryRealPath: realEntryPath,
        diagnostics: [{
          code: "developer-manifest-invalid",
          severity: "blocked",
          path: "entry",
          message: "Developer plugin entry must be a file.",
        }],
      }
    }
    if (stat.size > MAX_DEVELOPER_ENTRY_BYTES) {
      return {
        entryPath,
        entryRealPath: realEntryPath,
        diagnostics: [{
          code: "developer-manifest-limit-exceeded",
          severity: "blocked",
          path: "entry",
          message: `Developer plugin entry must be ${MAX_DEVELOPER_ENTRY_BYTES} bytes or less for review hashing.`,
        }],
      }
    }

    const content = await fs.readFile(realEntryPath)
    return {
      entryPath,
      entryRealPath: realEntryPath,
      entryContentHash: createHash("sha256").update(content).digest("hex"),
      diagnostics: [],
    }
  } catch {
    return {
      entryPath,
      diagnostics: [{
        code: "developer-manifest-invalid",
        severity: "blocked",
        path: "entry",
        message: "Developer plugin entry could not be read.",
      }],
    }
  }
}

async function scanDeveloperBundle(
  pluginRoot: string,
  entryRealPath: string,
): Promise<{
  bundleContentHash?: string
  bundleFileCount?: number
  bundleByteCount?: number
  diagnostics: PluginDeveloperTrustedDiagnostic[]
}> {
  const diagnostics: PluginDeveloperTrustedDiagnostic[] = []
  const files = new Map<string, { relativePath: string; size: number }>()

  try {
    const realRoot = await fs.realpath(pluginRoot)
    const entryBundleRoot = path.dirname(entryRealPath)
    if (!isPathInside(realRoot, entryBundleRoot)) {
      return {
        diagnostics: [{
          code: "developer-entry-outside-root",
          severity: "blocked",
          path: "entry",
          message: "Developer plugin bundle root escapes the plugin root.",
        }],
      }
    }

    await collectDeveloperBundleFiles({
      realRoot,
      dir: entryBundleRoot,
      files,
      diagnostics,
    })

    for (const fileName of DEVELOPER_BUNDLE_ROOT_FILES) {
      const candidate = path.join(realRoot, fileName)
      await addDeveloperBundleFile({
        realRoot,
        filePath: candidate,
        files,
        diagnostics,
        optional: true,
      })
    }

    const fileEntries = Array.from(files.values())
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    const totalBytes = fileEntries.reduce((sum, file) => sum + file.size, 0)
    if (fileEntries.length > MAX_DEVELOPER_BUNDLE_FILES) {
      diagnostics.push({
        code: "developer-manifest-limit-exceeded",
        severity: "blocked",
        path: "entry",
        message: `Developer plugin review bundle may include at most ${MAX_DEVELOPER_BUNDLE_FILES} files.`,
      })
    }
    if (totalBytes > MAX_DEVELOPER_BUNDLE_BYTES) {
      diagnostics.push({
        code: "developer-manifest-limit-exceeded",
        severity: "blocked",
        path: "entry",
        message: `Developer plugin review bundle must be ${MAX_DEVELOPER_BUNDLE_BYTES} bytes or less.`,
      })
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === "blocked")) {
      return { diagnostics }
    }

    const hash = createHash("sha256")
    for (const file of fileEntries) {
      const content = await fs.readFile(path.join(realRoot, file.relativePath))
      hash.update(file.relativePath)
      hash.update("\0")
      hash.update(createHash("sha256").update(content).digest("hex"))
      hash.update("\0")
    }

    return {
      bundleContentHash: hash.digest("hex"),
      bundleFileCount: fileEntries.length,
      bundleByteCount: totalBytes,
      diagnostics,
    }
  } catch {
    return {
      diagnostics: [{
        code: "developer-manifest-invalid",
        severity: "blocked",
        path: "entry",
        message: "Developer plugin review bundle could not be hashed.",
      }],
    }
  }
}

async function collectDeveloperBundleFiles(input: {
  realRoot: string
  dir: string
  files: Map<string, { relativePath: string; size: number }>
  diagnostics: PluginDeveloperTrustedDiagnostic[]
}): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(input.dir, { withFileTypes: true })
  } catch {
    input.diagnostics.push({
      code: "developer-manifest-invalid",
      severity: "blocked",
      path: "entry",
      message: "Developer plugin bundle directory could not be read.",
    })
    return
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".") || DEVELOPER_BUNDLE_SKIP_DIRS.has(entry.name)) continue
    const candidate = path.join(input.dir, entry.name)
    if (entry.isDirectory()) {
      const realDir = await safeRealpath(candidate)
      if (!realDir || !isPathInside(input.realRoot, realDir)) {
        input.diagnostics.push({
          code: "developer-entry-outside-root",
          severity: "blocked",
          path: "entry",
          message: "Developer plugin bundle directory escapes the plugin root.",
        })
        continue
      }
      await collectDeveloperBundleFiles({
        ...input,
        dir: realDir,
      })
      continue
    }

    await addDeveloperBundleFile({
      realRoot: input.realRoot,
      filePath: candidate,
      files: input.files,
      diagnostics: input.diagnostics,
      optional: false,
    })
  }
}

async function addDeveloperBundleFile(input: {
  realRoot: string
  filePath: string
  files: Map<string, { relativePath: string; size: number }>
  diagnostics: PluginDeveloperTrustedDiagnostic[]
  optional: boolean
}): Promise<void> {
  const extension = path.extname(input.filePath)
  if (!DEVELOPER_BUNDLE_EXTENSIONS.has(extension) && !DEVELOPER_BUNDLE_ROOT_FILES.includes(path.basename(input.filePath))) {
    return
  }

  const realFilePath = await safeRealpath(input.filePath)
  if (!realFilePath) {
    if (!input.optional) {
      input.diagnostics.push({
        code: "developer-manifest-invalid",
        severity: "blocked",
        path: "entry",
        message: "Developer plugin bundle file could not be read.",
      })
    }
    return
  }
  if (!isPathInside(input.realRoot, realFilePath)) {
    input.diagnostics.push({
      code: "developer-entry-outside-root",
      severity: "blocked",
      path: "entry",
      message: "Developer plugin bundle file escapes the plugin root.",
    })
    return
  }

  const stat = await fs.stat(realFilePath)
  if (!stat.isFile()) return
  const relativePath = path.relative(input.realRoot, realFilePath)
  input.files.set(realFilePath, { relativePath, size: stat.size })
}

async function safeRealpath(targetPath: string): Promise<string | undefined> {
  try {
    return await fs.realpath(targetPath)
  } catch {
    return undefined
  }
}

function buildDeveloperScanResult(input: {
  diagnostics: PluginDeveloperTrustedDiagnostic[]
  ignoredUnknownFields?: string[]
  manifestPath?: string
}): ScannedPluginReviewDocument["developerTrusted"] {
  return {
    reviewDocument: buildDeveloperTrustedReviewDocument({
      parseResult: {
        diagnostics: input.diagnostics,
        ignoredUnknownFields: input.ignoredUnknownFields ?? [],
      },
    }),
    diagnostics: input.diagnostics,
    ignoredUnknownFields: input.ignoredUnknownFields ?? [],
    manifestPath: input.manifestPath,
  }
}

export async function scanPluginReviewDocument(
  plugin: PluginInfo,
): Promise<ScannedPluginReviewDocument> {
  const paths = getPluginComponentPaths(plugin)
  const [commands, skills, agents, hooks, mcpServers, controlledUi, developerTrusted] = await Promise.all([
    scanPluginCommands(paths.commands),
    scanPluginSkills(paths.skills),
    scanPluginAgents(paths.agents),
    scanPluginHooks(paths.hooks),
    scanPluginMcpServers(paths.mcpServers),
    scanControlledUiManifest(plugin.path),
    scanDeveloperTrustedManifest(plugin.path),
  ])

  const components = {
    commands,
    skills,
    agents,
    hooks,
    mcpServers,
  }
  const targetModeSummary =
    plugin.runtime === "claude" && plugin.targetMode === "developer-trusted-code" && developerTrusted.manifest
      ? getDeveloperTrustedPluginTargetMode()
      : plugin.runtime === "claude" && controlledUi.manifest
      ? getControlledUiPluginTargetMode()
      : {
          targetMode: plugin.targetMode,
          executionStatus: plugin.executionStatus,
          updatePosture: plugin.updatePosture,
        }

  return {
    components,
    targetModeSummary,
    controlledUi,
    developerTrusted,
    reviewDocument: buildPluginManifestReviewDocument({
      runtime: plugin.runtime,
      source: plugin.source,
      marketplace: plugin.marketplace,
      name: plugin.name,
      version: plugin.version,
      targetMode: targetModeSummary.targetMode,
      executionStatus: targetModeSummary.executionStatus,
      updatePosture: targetModeSummary.updatePosture,
      category: plugin.category,
      homepage: plugin.homepage,
      tags: plugin.tags,
      componentPaths: plugin.componentPaths ?? {},
      components: {
        commands: commands.length,
        skills: skills.length,
        agents: agents.length,
        hooks: hooks.length,
        mcpServers,
      },
      controlledUi: controlledUi.reviewDocument,
      developerTrusted: developerTrusted.reviewDocument,
      sourcePins: plugin.sourcePins,
    }),
  }
}

function isPathInside(basePath: string, candidatePath: string): boolean {
  const relativePath = path.relative(basePath, candidatePath)
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  )
}
