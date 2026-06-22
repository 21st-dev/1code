import { discoverCodexInstalledPlugins, type PluginInfo } from "../plugins"
import { scanPluginReviewDocument } from "../plugins/review-scan"
import { buildRuntimeNativeActivationIdentity } from "../plugins/runtime-native-activation"
import {
  getEffectiveRuntimeNativePluginEnablementState,
  hashPluginManifestReviewDocument,
  type RuntimeNativePluginActivationScopeContext,
  recordPluginReviewScans,
} from "../plugins/update-review-state"
import {
  buildCodexAppServerResolvedPluginConfigOverrides,
  type CodexAppServerResolvedPluginConfigOverrides,
  getCodexAppServerPluginCacheCoordinates,
  getCodexAppServerPluginId,
} from "./app-server-plugin-config"

export async function resolveCodexAppServerPluginConfigOverrides(
  context: RuntimeNativePluginActivationScopeContext = {},
): Promise<CodexAppServerResolvedPluginConfigOverrides> {
  const [plugins, enablement] = await Promise.all([
    discoverCodexInstalledPlugins(),
    getEffectiveRuntimeNativePluginEnablementState(context).then(
      (effective) => effective.enablement,
    ),
  ])
  if (plugins.length === 0) return { config: {}, entries: [] }

  const scannedPlugins = await Promise.all(
    plugins.map(async (plugin) => {
      try {
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
        return { status: "scanned" as const, plugin, scan, identity }
      } catch {
        return { status: "failed" as const, plugin }
      }
    }),
  )
  const scannedCandidates = scannedPlugins.filter(
    (candidate) => candidate.status === "scanned",
  )
  const failedPlugins = scannedPlugins.filter(
    (candidate) => candidate.status === "failed",
  )

  const reviewResult = await recordPluginReviewScans(
    scannedCandidates.map(({ plugin, scan, identity }) => ({
      pluginKey: plugin.reviewKey,
      document: scan.reviewDocument,
      runtimeNativeActivationIdentity: identity,
    })),
  )

  return mergeFailedCodexPluginEntries(
    buildCodexAppServerResolvedPluginConfigOverrides({
      candidates: scannedCandidates.map(({ plugin, scan, identity }) => {
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
    }),
    failedPlugins.map(({ plugin }) => plugin),
  )
}

function mergeFailedCodexPluginEntries(
  resolved: CodexAppServerResolvedPluginConfigOverrides,
  failedPlugins: PluginInfo[],
): CodexAppServerResolvedPluginConfigOverrides {
  if (failedPlugins.length === 0) return resolved

  const byPluginId = new Map(
    resolved.entries.map((entry) => [entry.pluginId, entry]),
  )
  for (const plugin of failedPlugins) {
    const pluginId = getCodexAppServerPluginId(plugin)
    if (!pluginId || byPluginId.get(pluginId)?.enabled) continue

    byPluginId.set(pluginId, {
      pluginId,
      pluginSource: plugin.source,
      enabled: false,
      pluginPath: plugin.path,
      cacheCoordinates: getCodexAppServerPluginCacheCoordinates(plugin),
      nativeActivationPolicy: {
        status: "blocked",
        canActivateNative: false,
        identityStatus: "identity-unreviewed",
        reasons: ["native-load-failed"],
      },
    })
  }

  const entries = Array.from(byPluginId.values()).sort((a, b) =>
    a.pluginId.localeCompare(b.pluginId),
  )
  const config: Record<string, boolean> = {}
  for (const entry of entries) {
    config[`plugins.${entry.pluginId}.enabled`] = entry.enabled
  }

  return { config, entries }
}

function getPluginPackageHash(plugin: PluginInfo): string | undefined {
  return plugin.sourcePins?.find((pin) => pin.kind === "store-package-sha256")
    ?.value
}
