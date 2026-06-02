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
  getPluginReviewStatePath,
  getPluginSafeModeState,
  markPluginFingerprintReviewed,
  recordPluginReviewScans,
  setPluginSafeModeEnabled,
} from "../../plugins/update-review-state"
import {
  scanPluginReviewDocument,
  type PluginComponent,
} from "../../plugins/review-scan"
import {
  buildPluginControlledUiGate,
  getControlledUiActionPermissionId,
  type PluginControlledUiDiagnostic,
  type PluginControlledUiGate,
  type PluginControlledUiManifest,
} from "../../../../shared/plugin-controlled-ui"
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
import {
  buildPluginDoctorReport,
  type PluginDoctorReport,
} from "../../../../shared/plugin-doctor"
import { getEnabledPlugins } from "./claude-settings"
import {
  getControlledUiPermissionGrantStatus,
  grantControlledUiPermission,
} from "../../plugins/controlled-ui-state"

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
  controlledUi: {
    manifestPresent: boolean
    manifestPath?: string
    manifest?: PluginControlledUiManifest
    diagnostics: PluginControlledUiDiagnostic[]
    ignoredUnknownFields: string[]
    gate: PluginControlledUiGate
  }
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
  targetMode: PluginTargetMode
  executionStatus: PluginExecutionStatus
  updatePosture: PluginUpdatePosture
  components: PluginWithComponents["components"]
  controlledUi: Awaited<ReturnType<typeof scanPluginReviewDocument>>["controlledUi"]
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
  const { components, controlledUi, reviewDocument, targetModeSummary } = reviewScan
  const { commands, skills, agents, mcpServers } = components

  const reviewStatus = getPluginReviewStatus({
    runtime: plugin.runtime,
    hasMcpServers: mcpServers.length > 0,
  })
  const diagnostics = getPluginDiagnostics({
    runtime: plugin.runtime,
    targetMode: targetModeSummary.targetMode,
    reviewStatus,
    baseDiagnostics: plugin.diagnostics,
  })
  return {
    plugin,
    reviewStatus,
    diagnostics,
    targetMode: targetModeSummary.targetMode,
    executionStatus: targetModeSummary.executionStatus,
    updatePosture: targetModeSummary.updatePosture,
    components,
    controlledUi,
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
  const controlledUiGate = buildPluginControlledUiGate({
    runtime: plugin.runtime,
    targetMode: input.scanned.targetMode,
    updateReviewStatus: updateReview.status,
    safeModeEnabled: input.safeMode.enabled,
    hasValidManifest: Boolean(input.scanned.controlledUi.manifest),
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
    targetMode: input.scanned.targetMode,
    executionStatus: input.scanned.executionStatus,
    reviewStatus: input.scanned.reviewStatus,
    updatePosture: input.scanned.updatePosture,
    updateReview,
    safetyGate,
    sourcePins: plugin.sourcePins ?? [],
    diagnostics: input.scanned.diagnostics,
    controlledUi: {
      manifestPresent: Boolean(input.scanned.controlledUi.manifest),
      manifestPath: input.scanned.controlledUi.manifestPath,
      manifest: input.scanned.controlledUi.manifest,
      diagnostics: input.scanned.controlledUi.diagnostics,
      ignoredUnknownFields: input.scanned.controlledUi.ignoredUnknownFields,
      gate: controlledUiGate,
    },
    isDisabled: plugin.runtime === "claude" ? !input.enabledPlugins.includes(plugin.source) : false,
    canToggle: plugin.runtime === "claude",
    components: input.scanned.components,
    mcpApprovalIdentifiers: input.scanned.mcpApprovalIdentifiers,
  }
}

async function getControlledUiActionContext(input: {
  reviewKey: string
  contributionId: string
  actionId: string
}) {
  const [installedPlugins, safeMode] = await Promise.all([
    discoverAllRuntimePlugins(),
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
  const reviewResult = await recordPluginReviewScans([{
    pluginKey: plugin.reviewKey,
    document: scanned.reviewDocument,
  }])
  const updateReview =
    reviewResult.metadataByPluginKey[plugin.reviewKey] ??
    makeEmptyUpdateReviewMetadata(plugin)
  const contribution = scanned.controlledUi.manifest?.surfaces.find(
    (surface) => surface.id === input.contributionId,
  )

  if (!contribution) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Controlled UI contribution is not currently declared.",
    })
  }
  if (contribution.type !== "command-button" || contribution.action.id !== input.actionId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Controlled UI contribution action is not allowlisted.",
    })
  }

  const permissionId = getControlledUiActionPermissionId(contribution.action)
  const grantStatus = await getControlledUiPermissionGrantStatus({
    pluginReviewKey: plugin.reviewKey,
    contributionFingerprint: updateReview.fingerprint,
    contributionId: contribution.id,
    actionId: contribution.action.id,
    permissionId,
  })
  const baseGate = {
    runtime: plugin.runtime,
    targetMode: scanned.targetMode,
    updateReviewStatus: updateReview.status,
    safeModeEnabled: safeMode.enabled,
    hasValidManifest: Boolean(scanned.controlledUi.manifest),
    surfaceSupported: true,
    actionSupported: contribution.action.type === "insert-chat-draft",
  }

  return {
    plugin,
    scanned,
    contribution,
    permissionId,
    grantStatus,
    updateReview,
    gateForGrant: buildPluginControlledUiGate({
      ...baseGate,
      permissionGranted: true,
    }),
    gateForInvoke: buildPluginControlledUiGate({
      ...baseGate,
      permissionGranted: grantStatus === "current",
      permissionStale: grantStatus === "stale",
    }),
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
   * Build a local Doctor report for plugin metadata, review state, gates, and
   * declarations. This is diagnostic-only and does not execute plugin code.
   */
  doctor: publicProcedure.query(async (): Promise<PluginDoctorReport> => {
    const [installedPlugins, sources] = await Promise.all([
      discoverAllRuntimePlugins(),
      discoverPluginSources(),
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

    return buildPluginDoctorReport({
      safeMode: reviewResult.safeMode,
      reviewStatePath: getPluginReviewStatePath(),
      sources: sources.map((source) => ({
        id: source.id,
        runtime: source.runtime,
        status: source.status,
        path: source.path,
        pluginCount: source.pluginCount,
      })),
      plugins: scannedPlugins.map((scanned) => {
        const plugin = scanned.plugin
        const updateReview =
          reviewResult.metadataByPluginKey[plugin.reviewKey] ??
          makeEmptyUpdateReviewMetadata(plugin)
        const safetyGate = buildPluginSafetyGate({
          runtime: plugin.runtime,
          hasMcpServers: scanned.components.mcpServers.length > 0,
          updateReviewStatus: updateReview.status,
          safeModeEnabled: reviewResult.safeMode.enabled,
        })
        return {
          runtime: plugin.runtime,
          reviewKey: plugin.reviewKey,
          name: plugin.name,
          source: plugin.source,
          path: plugin.path,
          updateReview,
          safetyGate,
          sourcePins: plugin.sourcePins ?? [],
          diagnostics: scanned.diagnostics,
          componentCounts: {
            commands: scanned.components.commands.length,
            skills: scanned.components.skills.length,
            agents: scanned.components.agents.length,
            mcpServers: scanned.components.mcpServers.length,
          },
          controlledUi: {
            manifestPresent: Boolean(scanned.controlledUi.manifest),
            manifest: scanned.controlledUi.manifest,
            diagnostics: scanned.controlledUi.diagnostics,
            ignoredUnknownFields: scanned.controlledUi.ignoredUnknownFields,
            gate: buildPluginControlledUiGate({
              runtime: plugin.runtime,
              targetMode: scanned.targetMode,
              updateReviewStatus: updateReview.status,
              safeModeEnabled: reviewResult.safeMode.enabled,
              hasValidManifest: Boolean(scanned.controlledUi.manifest),
            }),
          },
          mcpServers: scanned.components.mcpServers,
          mcpApprovalIdentifiers: scanned.mcpApprovalIdentifiers,
        }
      }),
    })
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
   * Store a local fingerprint-bound grant for an allowlisted controlled UI
   * action. Main re-scans the plugin and review state before granting.
   */
  grantControlledAction: publicProcedure
    .input(z.object({
      reviewKey: z.string().min(1),
      contributionId: z.string().min(1),
      actionId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const context = await getControlledUiActionContext(input)
      if (!context.gateForGrant.canRenderControlledUi) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Controlled UI action cannot be granted for the current plugin state.",
        })
      }

      const grant = await grantControlledUiPermission({
        pluginReviewKey: context.plugin.reviewKey,
        contributionFingerprint: context.updateReview.fingerprint,
        contributionId: context.contribution.id,
        actionId: context.contribution.action.id,
        permissionId: context.permissionId,
      })
      return {
        grant,
        gate: context.gateForGrant,
      }
    }),

  /**
   * Invoke an allowlisted controlled UI action. This returns a bounded payload
   * for the renderer; it never sends chat, runs shell, edits files, approves
   * MCP, enables plugins, imports plugin JS, or patches the DOM.
   */
  invokeControlledAction: publicProcedure
    .input(z.object({
      reviewKey: z.string().min(1),
      contributionId: z.string().min(1),
      actionId: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const context = await getControlledUiActionContext(input)
      if (!context.gateForInvoke.canInvokeControlledAction) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Controlled UI action is blocked by current review, safe mode, or grant state.",
        })
      }

      return {
        type: "insert-chat-draft" as const,
        pluginReviewKey: context.plugin.reviewKey,
        contributionId: context.contribution.id,
        actionId: context.contribution.action.id,
        prompt: context.contribution.action.prompt,
      }
    }),

  /**
   * Clear plugin cache (forces re-scan on next list)
   */
  clearCache: publicProcedure.mutation(async () => {
    clearPluginCache()
    return { success: true }
  }),
})
