import { discoverCodexInstalledPlugins, type PluginInfo } from "../plugins"
import { scanPluginReviewDocument } from "../plugins/review-scan"
import { buildRuntimeNativeActivationIdentity } from "../plugins/runtime-native-activation"
import {
  getRuntimeNativePluginEnablementState,
  hashPluginManifestReviewDocument,
  recordPluginReviewScans,
} from "../plugins/update-review-state"
import {
  buildCodexAppServerResolvedPluginConfigOverrides,
  type CodexAppServerResolvedPluginConfigOverrides,
} from "./app-server-plugin-config"

export async function resolveCodexAppServerPluginConfigOverrides(): Promise<CodexAppServerResolvedPluginConfigOverrides> {
  const [plugins, enablement] = await Promise.all([
    discoverCodexInstalledPlugins(),
    getRuntimeNativePluginEnablementState(),
  ])
  if (plugins.length === 0) return { config: {}, entries: [] }

  const scannedPlugins = await Promise.all(
    plugins.map(async (plugin) => {
      const scan = await scanPluginReviewDocument(plugin)
      const reviewFingerprint = hashPluginManifestReviewDocument(
        scan.reviewDocument,
      )
      const identity = buildRuntimeNativeActivationIdentity({
        reviewDocument: scan.reviewDocument,
        reviewFingerprint,
        packageIdentity: plugin.source,
        packageVersion: plugin.version,
        sourcePins: plugin.sourcePins ?? scan.reviewDocument.sourcePins,
        packageHash: getPluginPackageHash(plugin),
      })
      return { plugin, scan, identity }
    }),
  )

  const reviewResult = await recordPluginReviewScans(
    scannedPlugins.map(({ plugin, scan, identity }) => ({
      pluginKey: plugin.reviewKey,
      document: scan.reviewDocument,
      runtimeNativeActivationIdentity: identity,
    })),
  )

  return buildCodexAppServerResolvedPluginConfigOverrides({
    candidates: scannedPlugins.map(({ plugin, scan, identity }) => {
      const updateReview = reviewResult.metadataByPluginKey[plugin.reviewKey]
      return {
        plugin,
        pluginEnabled: enablement[plugin.reviewKey]?.enabled === true,
        safeModeEnabled: reviewResult.safeMode.enabled,
        manifestReviewStatus: updateReview?.status,
        identity,
        reviewedIdentityFingerprint:
          updateReview?.runtimeNativeActivation
            ?.lastReviewedIdentityFingerprint,
        hasMcpServers: scan.components.mcpServers.length > 0,
        mcpServersApprovedOrFiltered: scan.components.mcpServers.length === 0,
      }
    }),
  })
}

function getPluginPackageHash(plugin: PluginInfo): string | undefined {
  return plugin.sourcePins?.find((pin) => pin.kind === "store-package-sha256")
    ?.value
}
