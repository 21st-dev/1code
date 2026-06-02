import { TRPCError } from "@trpc/server"
import { router, publicProcedure } from "../index"
import { z } from "zod"
import {
  discoverAllRuntimePlugins,
  discoverPluginMcpServers,
  discoverPluginSources,
  clearPluginCache,
  type PluginSourceInfo,
  type PluginRuntime,
  type PluginSourceKind,
  type PluginSourceTrust,
  type PluginInfo,
} from "../../plugins"
import {
  getPluginSafeModeState,
  markPluginFingerprintReviewed,
  recordPluginReviewScans,
  setPluginSafeModeEnabled,
} from "../../plugins/update-review-state"
import {
  scanPluginReviewDocument,
  type PluginComponent,
} from "../../plugins/review-scan"
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
import {
  buildPluginSafetyGate,
  type PluginSafeModeState,
  type PluginSafetyGate,
} from "../../../../shared/plugin-safety-gates"
import { getEnabledPlugins } from "./claude-settings"

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
  safetyGate: PluginSafetyGate
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
  reviewDocument: Awaited<ReturnType<typeof scanPluginReviewDocument>>["reviewDocument"]
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
  const [reviewScan, mcpApprovalIdentifiers] =
    await Promise.all([
      scanPluginReviewDocument(plugin),
      getPluginMcpApprovalIdentifiers(plugin),
    ])
  const { components, reviewDocument } = reviewScan
  const { commands, skills, agents, mcpServers } = components

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
  safeMode: PluginSafeModeState
}): PluginWithComponents {
  const { plugin } = input.scanned
  const updateReview = input.updateReview ?? makeEmptyUpdateReviewMetadata(plugin)
  const safetyGate = buildPluginSafetyGate({
    runtime: plugin.runtime,
    hasMcpServers: input.scanned.components.mcpServers.length > 0,
    updateReviewStatus: updateReview.status,
    safeModeEnabled: input.safeMode.enabled,
  })

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
    updateReview,
    safetyGate,
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
   * Get local plugin safe mode state.
   */
  safeMode: publicProcedure.query(async (): Promise<PluginSafeModeState> => {
    return getPluginSafeModeState()
  }),

  /**
   * Toggle local plugin safe mode without deleting packages or review metadata.
   */
  setSafeMode: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }): Promise<PluginSafeModeState> => {
      clearPluginCache()
      return setPluginSafeModeEnabled(input.enabled)
    }),

  /**
   * List all installed runtime plugins with their components and disabled status.
   */
  list: publicProcedure.query(async (): Promise<PluginWithComponents[]> => {
    const [installedPlugins, enabledPlugins, safeMode] = await Promise.all([
      discoverAllRuntimePlugins(),
      getEnabledPlugins(),
      getPluginSafeModeState(),
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
      safeMode,
    }))
  }),

  /**
   * Locally acknowledge the currently discovered manifest fingerprint.
   */
  markReviewed: publicProcedure
    .input(z.object({ reviewKey: z.string() }))
    .mutation(async ({ input }) => {
      const [installedPlugins, enabledPlugins, safeMode] = await Promise.all([
        discoverAllRuntimePlugins(),
        getEnabledPlugins(),
        getPluginSafeModeState(),
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
        safeMode,
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
