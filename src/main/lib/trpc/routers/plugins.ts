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
  addDeveloperPluginSource,
  getDeveloperPluginTrustStatus,
  getPluginDeveloperModeState,
  getPluginReviewStatePath,
  getPluginSafeModeState,
  markPluginFingerprintReviewed,
  recordPluginReviewScans,
  removeDeveloperPluginSource,
  revokeDeveloperPluginTrust,
  setPluginDeveloperModeEnabled,
  setPluginSafeModeEnabled,
  trustDeveloperPluginFingerprint,
  type PluginDeveloperSourceRecord,
} from "../../plugins/update-review-state"
import {
  scanPluginReviewDocument,
  type PluginComponent,
} from "../../plugins/review-scan"
import {
  buildPluginDeveloperTrustedGate,
  type PluginDeveloperModeState,
  type PluginDeveloperTrustedDiagnostic,
  type PluginDeveloperTrustedGate,
  type PluginDeveloperTrustedManifest,
  type PluginDeveloperTrustedStatus,
  type PluginDeveloperTrustedAcknowledgement,
} from "../../../../shared/plugin-developer-trusted"
import {
  buildPluginControlledUiGate,
  getControlledUiActionPermissionId,
  type PluginControlledUiDiagnostic,
  type PluginControlledUiField,
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
  getControlledUiSettingsValues,
  grantControlledUiPermission,
  setControlledUiSettingValue,
  type PluginControlledUiSettingValue,
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
    actionGrantStatuses: Record<string, "current" | "stale" | "mismatch">
    settingsValues: Record<string, Record<string, PluginControlledUiSettingValue>>
    gate: PluginControlledUiGate
  }
  developerTrusted: {
    manifestPresent: boolean
    manifestPath?: string
    manifest?: PluginDeveloperTrustedManifest
    diagnostics: PluginDeveloperTrustedDiagnostic[]
    ignoredUnknownFields: string[]
    entryPath?: string
    entryRealPath?: string
    entryContentHash?: string
    trustStatus: PluginDeveloperTrustedStatus
    acknowledgement?: PluginDeveloperTrustedAcknowledgement
    gate: PluginDeveloperTrustedGate
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
  developerTrusted: Awaited<ReturnType<typeof scanPluginReviewDocument>>["developerTrusted"]
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
  const { developerTrusted } = reviewScan
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
    developerTrusted,
    mcpApprovalIdentifiers,
    reviewDocument,
  }
}

async function getControlledUiActionGrantStatuses(input: {
  plugin: PluginInfo
  scanned: ScannedPlugin
  updateReview: PluginUpdateReviewMetadata
}): Promise<Record<string, "current" | "stale" | "mismatch">> {
  const commandButtons = input.scanned.controlledUi.manifest?.surfaces.filter(
    (surface) => surface.type === "command-button",
  ) ?? []
  const entries = await Promise.all(commandButtons.map(async (surface) => {
    if (surface.type !== "command-button") return undefined
    const key = `${surface.id}:${surface.action.id}`
    const status = await getControlledUiPermissionGrantStatus({
      pluginReviewKey: input.plugin.reviewKey,
      contributionFingerprint: input.updateReview.fingerprint,
      contributionId: surface.id,
      actionId: surface.action.id,
      permissionId: getControlledUiActionPermissionId(surface.action),
    })
    return [key, status] as const
  }))
  return Object.fromEntries(entries.filter((entry): entry is [string, "current" | "stale" | "mismatch"] => Boolean(entry)))
}

async function getControlledUiSettingsValuesByContribution(input: {
  plugin: PluginInfo
  scanned: ScannedPlugin
  updateReview: PluginUpdateReviewMetadata
}): Promise<Record<string, Record<string, PluginControlledUiSettingValue>>> {
  const settingsSections = input.scanned.controlledUi.manifest?.surfaces.filter(
    (surface) => surface.type === "settings-section",
  ) ?? []
  const entries = await Promise.all(settingsSections.map(async (surface) => {
    if (surface.type !== "settings-section") return undefined
    const values = await getControlledUiSettingsValues({
      pluginReviewKey: input.plugin.reviewKey,
      contributionFingerprint: input.updateReview.fingerprint,
      contributionId: surface.id,
      fieldIds: surface.fields.map((field) => field.id),
    })
    return [surface.id, values] as const
  }))
  return Object.fromEntries(
    entries.filter((entry): entry is [string, Record<string, PluginControlledUiSettingValue>] => Boolean(entry)),
  )
}

async function toPluginWithComponents(input: {
  scanned: ScannedPlugin
  enabledPlugins: string[]
  updateReview?: PluginUpdateReviewMetadata
  safeMode: PluginSafeModeState
  developerMode: PluginDeveloperModeState
}): Promise<PluginWithComponents> {
  const { plugin } = input.scanned
  const updateReview = input.updateReview ?? makeEmptyUpdateReviewMetadata(plugin)
  const [actionGrantStatuses, settingsValues] = await Promise.all([
    getControlledUiActionGrantStatuses({
      plugin,
      scanned: input.scanned,
      updateReview,
    }),
    getControlledUiSettingsValuesByContribution({
      plugin,
      scanned: input.scanned,
      updateReview,
    }),
  ])
  const grantValues = Object.values(actionGrantStatuses)
  const hasControlledActions = grantValues.length > 0
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
    permissionGranted: hasControlledActions
      ? grantValues.every((status) => status === "current")
      : undefined,
    permissionStale: grantValues.some((status) => status === "stale"),
  })
  const developerTrustContext = getDeveloperTrustContext({
    plugin,
    scanned: input.scanned,
    updateReview,
  })
  const developerTrustStatus = developerTrustContext
    ? await getDeveloperPluginTrustStatus(developerTrustContext)
    : { status: "missing" as const, acknowledgement: undefined }
  const developerTrustedGate = buildPluginDeveloperTrustedGate({
    runtime: plugin.runtime,
    targetMode: input.scanned.targetMode,
    updateReviewStatus: updateReview.status,
    safeModeEnabled: input.safeMode.enabled,
    developerModeEnabled: input.developerMode.enabled,
    isLocalDeveloperSource: plugin.sourceKind === "developer-local",
    hasValidManifest: Boolean(input.scanned.developerTrusted.manifest),
    entryContained: Boolean(input.scanned.developerTrusted.entryRealPath && input.scanned.developerTrusted.entryContentHash),
    trustStatus: developerTrustStatus.status,
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
      actionGrantStatuses,
      settingsValues,
      gate: controlledUiGate,
    },
    developerTrusted: {
      manifestPresent: Boolean(input.scanned.developerTrusted.manifest),
      manifestPath: input.scanned.developerTrusted.manifestPath,
      manifest: input.scanned.developerTrusted.manifest,
      diagnostics: input.scanned.developerTrusted.diagnostics,
      ignoredUnknownFields: input.scanned.developerTrusted.ignoredUnknownFields,
      entryPath: input.scanned.developerTrusted.entryPath,
      entryRealPath: input.scanned.developerTrusted.entryRealPath,
      entryContentHash: input.scanned.developerTrusted.entryContentHash,
      trustStatus: developerTrustStatus.status,
      acknowledgement: developerTrustStatus.acknowledgement,
      gate: developerTrustedGate,
    },
    isDisabled: plugin.runtime === "claude" && plugin.sourceKind !== "developer-local"
      ? !input.enabledPlugins.includes(plugin.source)
      : false,
    canToggle: plugin.runtime === "claude" && plugin.sourceKind !== "developer-local",
    components: input.scanned.components,
    mcpApprovalIdentifiers: input.scanned.mcpApprovalIdentifiers,
  }
}

function getDeveloperTrustContext(input: {
  plugin: PluginInfo
  scanned: ScannedPlugin
  updateReview: PluginUpdateReviewMetadata
}) {
  const manifest = input.scanned.developerTrusted.manifest
  const entryRealPath = input.scanned.developerTrusted.entryRealPath
  const entryContentHash = input.scanned.developerTrusted.entryContentHash
  if (!manifest || !entryRealPath || !entryContentHash) return undefined
  return {
    pluginReviewKey: input.plugin.reviewKey,
    pluginFingerprint: input.updateReview.fingerprint,
    manifestId: manifest.id,
    entryPath: entryRealPath,
    entryContentHash,
    sourcePath: input.plugin.path,
  }
}

async function getControlledUiCurrentContext(reviewKey: string) {
  const [installedPlugins, safeMode] = await Promise.all([
    discoverAllRuntimePlugins(),
    getPluginSafeModeState(),
  ])
  const plugin = installedPlugins.find((candidate) => candidate.reviewKey === reviewKey)
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

  return {
    plugin,
    scanned,
    safeMode,
    updateReview,
  }
}

async function getControlledUiActionContext(input: {
  reviewKey: string
  contributionId: string
  actionId: string
}) {
  const current = await getControlledUiCurrentContext(input.reviewKey)
  const { plugin, scanned, safeMode, updateReview } = current
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

async function getControlledUiSettingContext(input: {
  reviewKey: string
  contributionId: string
  fieldId: string
}) {
  const current = await getControlledUiCurrentContext(input.reviewKey)
  const { plugin, scanned, safeMode, updateReview } = current
  const contribution = scanned.controlledUi.manifest?.surfaces.find(
    (surface) => surface.id === input.contributionId,
  )

  if (!contribution) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Controlled UI settings contribution is not currently declared.",
    })
  }
  if (contribution.type !== "settings-section") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Controlled UI contribution is not a settings section.",
    })
  }

  const field = contribution.fields.find((candidate) => candidate.id === input.fieldId)
  if (!field) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Controlled UI settings field is not currently declared.",
    })
  }

  const gate = buildPluginControlledUiGate({
    runtime: plugin.runtime,
    targetMode: scanned.targetMode,
    updateReviewStatus: updateReview.status,
    safeModeEnabled: safeMode.enabled,
    hasValidManifest: Boolean(scanned.controlledUi.manifest),
    surfaceSupported: true,
  })

  return {
    plugin,
    scanned,
    contribution,
    field,
    updateReview,
    gate,
  }
}

function normalizeControlledUiSettingValue(
  field: PluginControlledUiField,
  value: PluginControlledUiSettingValue,
): PluginControlledUiSettingValue {
  if (field.type === "checkbox") {
    if (typeof value !== "boolean") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Controlled UI checkbox settings require a boolean value.",
      })
    }
    return value
  }

  if (typeof value !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Controlled UI text and select settings require a string value.",
    })
  }

  if (field.type === "select" && !(field.options ?? []).includes(value)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Controlled UI select setting value is not declared by the manifest.",
    })
  }

  return value
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
   * Get local Developer Plugin Mode state.
   */
  developerMode: publicProcedure.query(async (): Promise<PluginDeveloperModeState> => {
    return getPluginDeveloperModeState()
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
   * Toggle Developer Plugin Mode. This does not trust or load any plugin by
   * itself; per-plugin review and trust gates still apply.
   */
  setDeveloperMode: publicProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ input }): Promise<PluginDeveloperModeState> => {
      clearPluginCache()
      return setPluginDeveloperModeEnabled(input.enabled)
    }),

  /**
   * Register a local developer plugin directory. Main validates that the path
   * resolves to a directory; remote store/cache packages are not accepted here.
   */
  addDeveloperSource: publicProcedure
    .input(z.object({ path: z.string().min(1) }))
    .mutation(async ({ input }): Promise<PluginDeveloperSourceRecord> => {
      clearPluginCache()
      try {
        return await addDeveloperPluginSource(input.path)
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error
            ? error.message
            : "Developer plugin source could not be registered.",
        })
      }
    }),

  removeDeveloperSource: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      clearPluginCache()
      return removeDeveloperPluginSource(input.id)
    }),

  /**
   * List all installed runtime plugins with their components and disabled status.
   */
  list: publicProcedure.query(async (): Promise<PluginWithComponents[]> => {
    const [installedPlugins, enabledPlugins, safeMode, developerMode] = await Promise.all([
      discoverAllRuntimePlugins(),
      getEnabledPlugins(),
      getPluginSafeModeState(),
      getPluginDeveloperModeState(),
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

    return Promise.all(scannedPlugins.map((scanned) => toPluginWithComponents({
      scanned,
      enabledPlugins,
      updateReview: reviewResult.metadataByPluginKey[scanned.plugin.reviewKey],
      safeMode,
      developerMode,
    })))
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
      const [installedPlugins, enabledPlugins, safeMode, developerMode] = await Promise.all([
        discoverAllRuntimePlugins(),
        getEnabledPlugins(),
        getPluginSafeModeState(),
        getPluginDeveloperModeState(),
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
        developerMode,
      })
  }),

  trustDeveloperPlugin: publicProcedure
    .input(z.object({ reviewKey: z.string().min(1) }))
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
      const reviewResult = await recordPluginReviewScans([{
        pluginKey: plugin.reviewKey,
        document: scanned.reviewDocument,
      }])
      const updateReview =
        reviewResult.metadataByPluginKey[plugin.reviewKey] ??
        makeEmptyUpdateReviewMetadata(plugin)
      const developerMode = await getPluginDeveloperModeState()
      const trustContext = getDeveloperTrustContext({ plugin, scanned, updateReview })
      const gate = buildPluginDeveloperTrustedGate({
        runtime: plugin.runtime,
        targetMode: scanned.targetMode,
        updateReviewStatus: updateReview.status,
        safeModeEnabled: reviewResult.safeMode.enabled,
        developerModeEnabled: developerMode.enabled,
        isLocalDeveloperSource: plugin.sourceKind === "developer-local",
        hasValidManifest: Boolean(scanned.developerTrusted.manifest),
        entryContained: Boolean(scanned.developerTrusted.entryRealPath && scanned.developerTrusted.entryContentHash),
        trustStatus: "current",
      })
      if (!trustContext || !gate.canTrustCurrentFingerprint) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Developer plugin cannot be trusted for the current state.",
        })
      }

      const acknowledgement = await trustDeveloperPluginFingerprint(trustContext)
      return toPluginWithComponents({
        scanned,
        enabledPlugins,
        updateReview,
        safeMode: reviewResult.safeMode,
        developerMode,
      }).then((pluginWithComponents) => ({
        plugin: pluginWithComponents,
        acknowledgement,
      }))
    }),

  revokeDeveloperPluginTrust: publicProcedure
    .input(z.object({ reviewKey: z.string().min(1) }))
    .mutation(async ({ input }) => {
      return revokeDeveloperPluginTrust(input.reviewKey)
    }),

  /**
   * Persist a Locus-owned controlled UI setting value. The field is validated
   * against the current manifest and current fingerprint in the main process.
   */
  setControlledSetting: publicProcedure
    .input(z.object({
      reviewKey: z.string().min(1),
      contributionId: z.string().min(1),
      fieldId: z.string().min(1),
      value: z.union([z.string().max(4000), z.boolean()]),
    }))
    .mutation(async ({ input }) => {
      const context = await getControlledUiSettingContext(input)
      if (!context.gate.canRenderControlledUi) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Controlled UI setting is blocked by current review or safe mode.",
        })
      }

      const setting = await setControlledUiSettingValue({
        pluginReviewKey: context.plugin.reviewKey,
        contributionFingerprint: context.updateReview.fingerprint,
        contributionId: context.contribution.id,
        fieldId: context.field.id,
        value: normalizeControlledUiSettingValue(context.field, input.value),
      })
      return {
        setting,
        gate: context.gate,
      }
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
