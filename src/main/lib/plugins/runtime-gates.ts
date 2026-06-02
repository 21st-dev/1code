import type { PluginUpdateReviewMetadata } from "../../../shared/plugin-update-review"
import {
  buildPluginSafetyGate,
  type PluginSafetyGate,
} from "../../../shared/plugin-safety-gates"
import {
  discoverInstalledPlugins,
  type PluginInfo,
} from "."
import {
  scanPluginReviewDocument,
  type PluginDeclaredComponents,
} from "./review-scan"
import { recordPluginReviewScans } from "./update-review-state"

export interface AllowedClaudePluginRuntimeComponents {
  plugin: PluginInfo
  components: PluginDeclaredComponents
  updateReview: PluginUpdateReviewMetadata
  safetyGate: PluginSafetyGate
}

export async function discoverAllowedClaudePluginRuntimeComponents(
  enabledPluginSources: string[],
): Promise<AllowedClaudePluginRuntimeComponents[]> {
  if (enabledPluginSources.length === 0) return []

  const enabledSources = new Set(enabledPluginSources)
  const enabledPlugins = (await discoverInstalledPlugins()).filter((plugin) =>
    enabledSources.has(plugin.source)
  )
  if (enabledPlugins.length === 0) return []

  const scannedPlugins = await Promise.all(enabledPlugins.map(async (plugin) => ({
    plugin,
    scan: await scanPluginReviewDocument(plugin),
  })))
  const reviewResult = await recordPluginReviewScans(
    scannedPlugins.map(({ plugin, scan }) => ({
      pluginKey: plugin.reviewKey,
      document: scan.reviewDocument,
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

    return [{
      plugin,
      components: scan.components,
      updateReview,
      safetyGate,
    }]
  })
}
