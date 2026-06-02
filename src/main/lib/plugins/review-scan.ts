import * as fs from "fs/promises"
import * as path from "path"
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
  }
  reviewDocument: ReturnType<typeof buildPluginManifestReviewDocument>
}

const CONTROLLED_UI_MANIFEST_RELATIVE_PATH = path.join(".locus-plugin", "ui.json")
const DEVELOPER_MANIFEST_RELATIVE_PATH = path.join(".locus-plugin", "developer.json")
const MAX_CONTROLLED_UI_MANIFEST_BYTES = 64 * 1024
const MAX_DEVELOPER_MANIFEST_BYTES = 64 * 1024
const MAX_DEVELOPER_ENTRY_BYTES = 2 * 1024 * 1024

function getPluginComponentPaths(plugin: PluginInfo) {
  return {
    commands: plugin.componentPaths?.commands ?? path.join(plugin.path, "commands"),
    skills: plugin.componentPaths?.skills ?? path.join(plugin.path, "skills"),
    agents: plugin.componentPaths?.agents ?? path.join(plugin.path, "agents"),
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
    const diagnostics = [...parsed.diagnostics, ...entryScan.diagnostics]
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
      }),
      diagnostics,
      ignoredUnknownFields: parsed.ignoredUnknownFields,
      manifestPath,
      entryPath: entryScan.entryPath,
      entryRealPath: entryScan.entryRealPath,
      entryContentHash: entryScan.entryContentHash,
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
  const [commands, skills, agents, mcpServers, controlledUi, developerTrusted] = await Promise.all([
    scanPluginCommands(paths.commands),
    scanPluginSkills(paths.skills),
    scanPluginAgents(paths.agents),
    scanPluginMcpServers(paths.mcpServers),
    scanControlledUiManifest(plugin.path),
    scanDeveloperTrustedManifest(plugin.path),
  ])

  const components = {
    commands,
    skills,
    agents,
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
