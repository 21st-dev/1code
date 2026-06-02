import { TRPCError } from "@trpc/server"
import { router, publicProcedure } from "../index"
import * as fs from "fs/promises"
import * as path from "path"
import { z } from "zod"
import { resolveDirentType } from "../../fs/dirent"
import { parseMarkdownFrontmatter } from "../../markdown/frontmatter"
import {
  discoverAllRuntimePlugins,
  discoverPluginMcpServers,
  discoverPluginSources,
  getPluginComponentPaths,
  clearPluginCache,
  type PluginSourceInfo,
  type PluginRuntime,
  type PluginSourceKind,
  type PluginSourceTrust,
  type PluginInfo,
} from "../../plugins"
import {
  buildPluginManifestReviewDocument,
  markPluginFingerprintReviewed,
  recordPluginReviewScans,
} from "../../plugins/update-review-state"
import type {
  PluginSourcePin,
  PluginUpdateReviewMetadata,
} from "../../../../shared/plugin-update-review"
import {
  getPluginDiagnostics,
  getPluginReviewStatus,
  type PluginDiagnostic,
  type PluginExecutionStatus,
  type PluginReviewStatus,
  type PluginTargetMode,
  type PluginUpdatePosture,
} from "../../../../shared/plugin-target-modes"
import { getEnabledPlugins } from "./claude-settings"

export interface PluginComponent {
  name: string
  description?: string
}

export interface PluginWithComponents {
  runtime: PluginRuntime
  reviewKey: string
  name: string
  version: string
  description?: string
  path: string
  installRoot: string
  source: string // e.g., "ccsetup:ccsetup"
  marketplace: string
  category?: string
  homepage?: string
  tags?: string[]
  sourceKind: PluginSourceKind
  sourceTrust: PluginSourceTrust
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  reviewStatus: PluginReviewStatus
  updatePosture: PluginUpdatePosture
  updateReview: PluginUpdateReviewMetadata
  sourcePins: PluginSourcePin[]
  diagnostics: PluginDiagnostic[]
  isDisabled: boolean
  canToggle: boolean
  components: {
    commands: PluginComponent[]
    skills: PluginComponent[]
    agents: PluginComponent[]
    mcpServers: string[]
  }
  mcpApprovalIdentifiers: Record<string, string>
}

interface ScannedPlugin {
  plugin: PluginInfo
  reviewStatus: PluginReviewStatus
  diagnostics: PluginDiagnostic[]
  components: PluginWithComponents["components"]
  mcpApprovalIdentifiers: Record<string, string>
  reviewDocument: ReturnType<typeof buildPluginManifestReviewDocument>
}

/**
 * Validate entry name for security (prevent path traversal)
 */
function isValidEntryName(name: string): boolean {
  return !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

/**
 * Scan commands directory and return component info
 */
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
        // Recursively scan nested directories for namespaced commands
        const nested = await scanPluginCommands(fullPath)
        components.push(...nested)
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
          // Skip files that can't be read
        }
      }
    }
  } catch {
    // Directory read failed
  }

  return components
}

/**
 * Scan skills directory and return component info
 */
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
        // Skill directory doesn't have SKILL.md - skip
      }
    }
  } catch {
    // Directory read failed
  }

  return components
}

/**
 * Scan agents directory and return component info
 */
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
        // Skip files that can't be read
      }
    }
  } catch {
    // Directory read failed
  }

  return components
}

/**
 * Scan a plugin .mcp.json file and return server names.
 */
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

function makeEmptyUpdateReviewMetadata(plugin: PluginInfo): PluginUpdateReviewMetadata {
  return {
    fingerprint: "",
    status: "new",
    sourcePins: plugin.sourcePins ?? [],
    changes: [],
  }
}

async function getPluginMcpApprovalIdentifiers(
  plugin: PluginInfo,
): Promise<Record<string, string>> {
  if (plugin.runtime !== "claude") return {}
  const configs = await discoverPluginMcpServers()
  return configs.find((config) => config.pluginSource === plugin.source)
    ?.approvalIdentifiers ?? {}
}

async function scanPluginWithComponents(plugin: PluginInfo): Promise<ScannedPlugin> {
  const paths = getPluginComponentPaths(plugin)

  const [commands, skills, agents, mcpServers, mcpApprovalIdentifiers] =
    await Promise.all([
      scanPluginCommands(paths.commands),
      scanPluginSkills(paths.skills),
      scanPluginAgents(paths.agents),
      scanPluginMcpServers(paths.mcpServers),
      getPluginMcpApprovalIdentifiers(plugin),
    ])

  const reviewStatus = getPluginReviewStatus({
    runtime: plugin.runtime,
    hasMcpServers: mcpServers.length > 0,
  })
  const diagnostics = getPluginDiagnostics({
    runtime: plugin.runtime,
    targetMode: plugin.targetMode,
    reviewStatus,
    baseDiagnostics: plugin.diagnostics,
  })
  const components = {
    commands,
    skills,
    agents,
    mcpServers,
  }
  const reviewDocument = buildPluginManifestReviewDocument({
    runtime: plugin.runtime,
    source: plugin.source,
    marketplace: plugin.marketplace,
    name: plugin.name,
    version: plugin.version,
    targetMode: plugin.targetMode,
    executionStatus: plugin.executionStatus,
    updatePosture: plugin.updatePosture,
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
    sourcePins: plugin.sourcePins,
  })

  return {
    plugin,
    reviewStatus,
    diagnostics,
    components,
    mcpApprovalIdentifiers,
    reviewDocument,
  }
}

function toPluginWithComponents(input: {
  scanned: ScannedPlugin
  enabledPlugins: string[]
  updateReview?: PluginUpdateReviewMetadata
}): PluginWithComponents {
  const { plugin } = input.scanned
  return {
    runtime: plugin.runtime,
    reviewKey: plugin.reviewKey,
    name: plugin.name,
    version: plugin.version,
    description: plugin.description,
    path: plugin.path,
    installRoot: plugin.installRoot,
    source: plugin.source,
    marketplace: plugin.marketplace,
    category: plugin.category,
    homepage: plugin.homepage,
    tags: plugin.tags,
    sourceKind: plugin.sourceKind,
    sourceTrust: plugin.sourceTrust,
    targetMode: plugin.targetMode,
    executionStatus: plugin.executionStatus,
    reviewStatus: input.scanned.reviewStatus,
    updatePosture: plugin.updatePosture,
    updateReview: input.updateReview ?? makeEmptyUpdateReviewMetadata(plugin),
    sourcePins: plugin.sourcePins ?? [],
    diagnostics: input.scanned.diagnostics,
    isDisabled: plugin.runtime === "claude" ? !input.enabledPlugins.includes(plugin.source) : false,
    canToggle: plugin.runtime === "claude",
    components: input.scanned.components,
    mcpApprovalIdentifiers: input.scanned.mcpApprovalIdentifiers,
  }
}

export const pluginsRouter = router({
  /**
   * List local/cache plugin sources by runtime.
   */
  sources: publicProcedure.query(async (): Promise<PluginSourceInfo[]> => {
    return discoverPluginSources()
  }),

  /**
   * List all installed runtime plugins with their components and disabled status.
   */
  list: publicProcedure.query(async (): Promise<PluginWithComponents[]> => {
    const [installedPlugins, enabledPlugins] = await Promise.all([
      discoverAllRuntimePlugins(),
      getEnabledPlugins(),
    ])

    const scannedPlugins = await Promise.all(
      installedPlugins.map((plugin) => scanPluginWithComponents(plugin)),
    )
    const reviewResult = await recordPluginReviewScans(
      scannedPlugins.map((scanned) => ({
        pluginKey: scanned.plugin.reviewKey,
        document: scanned.reviewDocument,
      })),
    )

    return scannedPlugins.map((scanned) => toPluginWithComponents({
      scanned,
      enabledPlugins,
      updateReview: reviewResult.metadataByPluginKey[scanned.plugin.reviewKey],
    }))
  }),

  /**
   * Locally acknowledge the currently discovered manifest fingerprint.
   */
  markReviewed: publicProcedure
    .input(z.object({ reviewKey: z.string() }))
    .mutation(async ({ input }) => {
      const [installedPlugins, enabledPlugins] = await Promise.all([
        discoverAllRuntimePlugins(),
        getEnabledPlugins(),
      ])
      const plugin = installedPlugins.find((candidate) => candidate.reviewKey === input.reviewKey)
      if (!plugin) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Plugin is not currently discovered.",
        })
      }

      const scanned = await scanPluginWithComponents(plugin)
      const updateReview = await markPluginFingerprintReviewed({
        pluginKey: plugin.reviewKey,
        document: scanned.reviewDocument,
      })

      return toPluginWithComponents({
        scanned,
        enabledPlugins,
        updateReview,
      })
  }),

  /**
   * Clear plugin cache (forces re-scan on next list)
   */
  clearCache: publicProcedure.mutation(async () => {
    clearPluginCache()
    return { success: true }
  }),
})
