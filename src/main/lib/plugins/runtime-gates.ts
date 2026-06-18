import {
  buildPluginSafetyGate,
  type PluginSafetyGate,
} from "../../../shared/plugin-safety-gates"
import type { PluginUpdateReviewMetadata } from "../../../shared/plugin-update-review"
import {
  discoverInstalledPlugins,
  discoverPluginMcpServers,
  type PluginInfo,
} from "."
import {
  type PluginDeclaredComponents,
  scanPluginReviewDocument,
} from "./review-scan"
import {
  buildRuntimeNativeActivationIdentity,
  buildRuntimeNativeActivationPolicy,
  type RuntimeNativeActivationPolicy,
} from "./runtime-native-activation"
import {
  hashPluginManifestReviewDocument,
  recordPluginReviewScans,
} from "./update-review-state"

export interface AllowedClaudePluginRuntimeComponents {
  plugin: PluginInfo
  components: PluginDeclaredComponents
  updateReview: PluginUpdateReviewMetadata
  safetyGate: PluginSafetyGate
}

export interface AllowedClaudeNativePluginRuntimeComponents {
  pluginSource: string
  marketplace: string
  name: string
  version: string
  path: string
  description?: string
  category?: string
  homepage?: string
  tags?: string[]
  nativeActivationPolicy: RuntimeNativeActivationPolicy
}

export async function discoverAllowedClaudePluginRuntimeComponents(
  enabledPluginSources: string[],
): Promise<AllowedClaudePluginRuntimeComponents[]> {
  if (enabledPluginSources.length === 0) return []

  const enabledSources = new Set(enabledPluginSources)
  const enabledPlugins = (await discoverInstalledPlugins()).filter((plugin) =>
    enabledSources.has(plugin.source),
  )
  if (enabledPlugins.length === 0) return []

  const scannedPlugins = await Promise.all(
    enabledPlugins.map(async (plugin) => {
      const scan = await scanPluginReviewDocument(plugin)
      const reviewFingerprint = hashPluginManifestReviewDocument(
        scan.reviewDocument,
      )
      return {
        plugin,
        scan,
        runtimeNativeActivationIdentity: buildRuntimeNativeActivationIdentity({
          reviewDocument: scan.reviewDocument,
          reviewFingerprint,
          packageIdentity: plugin.source,
          packageVersion: plugin.version,
          sourcePins: plugin.sourcePins ?? scan.reviewDocument.sourcePins,
          packageHash: getPluginPackageHash(plugin),
        }),
      }
    }),
  )
  const reviewResult = await recordPluginReviewScans(
    scannedPlugins.map(({ plugin, scan, runtimeNativeActivationIdentity }) => ({
      pluginKey: plugin.reviewKey,
      document: scan.reviewDocument,
      runtimeNativeActivationIdentity,
    })),
  )

  return scannedPlugins.flatMap(({ plugin, scan }) => {
    const updateReview = reviewResult.metadataByPluginKey[plugin.reviewKey]
    const safetyGate = buildPluginSafetyGate({
      runtime: plugin.runtime,
      hasMcpServers: scan.components.mcpServers.length > 0,
      updateReviewStatus: updateReview?.status,
      safeModeEnabled: reviewResult.safeMode.enabled,
    })

    if (safetyGate.status !== "allowed" || !updateReview) return []

    return [
      {
        plugin,
        components: scan.components,
        updateReview,
        safetyGate,
      },
    ]
  })
}

export async function discoverAllowedClaudeNativePluginRuntimeComponents(input: {
  enabledPluginSources: string[]
  approvedPluginMcpServerIdentifiers: string[]
}): Promise<AllowedClaudeNativePluginRuntimeComponents[]> {
  if (input.enabledPluginSources.length === 0) return []

  const enabledSources = new Set(input.enabledPluginSources)
  const approvedMcpServerIdentifiers = new Set(
    input.approvedPluginMcpServerIdentifiers,
  )
  const [installedPlugins, pluginMcpConfigs] = await Promise.all([
    discoverInstalledPlugins(),
    discoverPluginMcpServers(),
  ])
  const enabledPlugins = installedPlugins.filter((plugin) =>
    enabledSources.has(plugin.source),
  )
  if (enabledPlugins.length === 0) return []

  const scannedPlugins = await Promise.all(
    enabledPlugins.map(async (plugin) => {
      const scan = await scanPluginReviewDocument(plugin)
      const reviewFingerprint = hashPluginManifestReviewDocument(
        scan.reviewDocument,
      )
      return {
        plugin,
        scan,
        runtimeNativeActivationIdentity: buildRuntimeNativeActivationIdentity({
          reviewDocument: scan.reviewDocument,
          reviewFingerprint,
          packageIdentity: plugin.source,
          packageVersion: plugin.version,
          sourcePins: plugin.sourcePins ?? scan.reviewDocument.sourcePins,
          packageHash: getPluginPackageHash(plugin),
        }),
      }
    }),
  )
  const reviewResult = await recordPluginReviewScans(
    scannedPlugins.map(({ plugin, scan, runtimeNativeActivationIdentity }) => ({
      pluginKey: plugin.reviewKey,
      document: scan.reviewDocument,
      runtimeNativeActivationIdentity,
    })),
  )

  return scannedPlugins.flatMap(
    ({ plugin, scan, runtimeNativeActivationIdentity }) => {
      const updateReview = reviewResult.metadataByPluginKey[plugin.reviewKey]
      if (!updateReview) return []

      const hasMcpServers = scan.components.mcpServers.length > 0
      const nativeActivationPolicy = buildRuntimeNativeActivationPolicy({
        pluginEnabled: true,
        safeModeEnabled: reviewResult.safeMode.enabled,
        manifestReviewStatus: updateReview.status,
        runtimeSupportsNativeLoading: true,
        runtimeSupportsPerRunPluginControl: true,
        identity: runtimeNativeActivationIdentity,
        reviewedIdentityFingerprint:
          updateReview.runtimeNativeActivation?.lastReviewedIdentityFingerprint,
        hasMcpServers,
        mcpServersApprovedOrFiltered: arePluginMcpServersApproved({
          plugin,
          mcpServerNames: scan.components.mcpServers,
          approvedMcpServerIdentifiers,
          pluginMcpConfigs,
        }),
      })
      if (!nativeActivationPolicy.canActivateNative) return []

      return [
        {
          pluginSource: plugin.source,
          marketplace: plugin.marketplace,
          name: plugin.name,
          version: plugin.version,
          path: plugin.path,
          description: plugin.description,
          category: plugin.category,
          homepage: plugin.homepage,
          tags: plugin.tags,
          nativeActivationPolicy,
        },
      ]
    },
  )
}

function arePluginMcpServersApproved(input: {
  plugin: PluginInfo
  mcpServerNames: string[]
  approvedMcpServerIdentifiers: Set<string>
  pluginMcpConfigs: Awaited<ReturnType<typeof discoverPluginMcpServers>>
}): boolean {
  if (input.mcpServerNames.length === 0) return true

  const pluginMcpConfig = input.pluginMcpConfigs.find(
    (config) => config.pluginSource === input.plugin.source,
  )
  if (!pluginMcpConfig?.reviewGate.canUseMcp) return false

  return input.mcpServerNames.every((serverName) => {
    const identifier = pluginMcpConfig.approvalIdentifiers[serverName]
    return Boolean(
      identifier && input.approvedMcpServerIdentifiers.has(identifier),
    )
  })
}

function getPluginPackageHash(plugin: PluginInfo): string | undefined {
  return plugin.sourcePins?.find((pin) => pin.kind === "store-package-sha256")
    ?.value
}
