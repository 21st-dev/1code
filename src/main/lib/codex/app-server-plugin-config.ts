import type { PluginUpdateReviewStatus } from "../../../shared/plugin-update-review"
import type { PluginInfo } from "../plugins"
import {
  buildRuntimeNativeActivationPolicy,
  type RuntimeNativeActivationIdentity,
  type RuntimeNativeActivationPolicy,
  runtimeSupportsProvenNativePluginLoading,
  runtimeSupportsProvenPerRunPluginControl,
} from "../plugins/runtime-native-activation"

export interface CodexAppServerPluginCacheCoordinates {
  marketplace: string
  name: string
  version: string
}

export interface CodexAppServerPluginConfigEntry {
  pluginId: string
  pluginSource: string
  enabled: boolean
  pluginPath?: string
  cacheCoordinates?: CodexAppServerPluginCacheCoordinates
}

export interface CodexAppServerPluginActivationCandidate {
  plugin: Pick<
    PluginInfo,
    "runtime" | "marketplace" | "source" | "sourceKind"
  > &
    Partial<Pick<PluginInfo, "path">>
  pluginEnabled: boolean
  safeModeEnabled: boolean
  manifestReviewStatus?: PluginUpdateReviewStatus
  identity: RuntimeNativeActivationIdentity
  reviewedIdentityFingerprint?: string
  identityIncompleteAcknowledgedFingerprint?: string
  hasMcpServers: boolean
  mcpServersApprovedOrFiltered: boolean
  nativeLoadFailure?: boolean
}

export interface CodexAppServerResolvedPluginConfigEntry
  extends CodexAppServerPluginConfigEntry {
  nativeActivationPolicy: RuntimeNativeActivationPolicy
}

export interface CodexAppServerResolvedPluginConfigOverrides {
  config: Record<string, boolean>
  entries: CodexAppServerResolvedPluginConfigEntry[]
}

export function getCodexAppServerPluginId(
  plugin: Pick<PluginInfo, "runtime" | "marketplace" | "source">,
): string | undefined {
  if (plugin.runtime !== "codex") return undefined

  const sourcePrefix = `${plugin.marketplace}:`
  if (!plugin.source.startsWith(sourcePrefix)) return undefined

  const sourceRemainder = plugin.source.slice(sourcePrefix.length)
  const versionSeparator = sourceRemainder.lastIndexOf("@")
  const pluginName =
    versionSeparator >= 0
      ? sourceRemainder.slice(0, versionSeparator)
      : sourceRemainder
  const normalizedPluginName = pluginName.trim()
  const normalizedMarketplace = plugin.marketplace.trim()

  if (!normalizedPluginName || !normalizedMarketplace) return undefined
  return `${normalizedPluginName}@${normalizedMarketplace}`
}

export function getCodexAppServerPluginCacheCoordinates(
  plugin: Pick<PluginInfo, "runtime" | "marketplace" | "source">,
): CodexAppServerPluginCacheCoordinates | undefined {
  if (plugin.runtime !== "codex") return undefined

  const sourcePrefix = `${plugin.marketplace}:`
  if (!plugin.source.startsWith(sourcePrefix)) return undefined

  const sourceRemainder = plugin.source.slice(sourcePrefix.length)
  const versionSeparator = sourceRemainder.lastIndexOf("@")
  if (
    versionSeparator <= 0 ||
    versionSeparator === sourceRemainder.length - 1
  ) {
    return undefined
  }

  const name = sourceRemainder.slice(0, versionSeparator).trim()
  const version = sourceRemainder.slice(versionSeparator + 1).trim()
  const marketplace = plugin.marketplace.trim()
  if (
    !isSafeCodexPluginCacheSegment(marketplace) ||
    !isSafeCodexPluginCacheSegment(name) ||
    !isSafeCodexPluginCacheSegment(version)
  ) {
    return undefined
  }

  return { marketplace, name, version }
}

export function buildCodexAppServerResolvedPluginConfigOverrides(input: {
  candidates: CodexAppServerPluginActivationCandidate[]
}): CodexAppServerResolvedPluginConfigOverrides {
  const byPluginId = new Map<string, CodexAppServerResolvedPluginConfigEntry>()

  for (const candidate of input.candidates) {
    const pluginId = getCodexAppServerPluginId(candidate.plugin)
    if (!pluginId) continue

    const runtimeSupportInput = {
      runtime: candidate.plugin.runtime,
      sourceKind: candidate.plugin.sourceKind,
    }
    const nativeActivationPolicy = buildRuntimeNativeActivationPolicy({
      pluginEnabled: candidate.pluginEnabled,
      safeModeEnabled: candidate.safeModeEnabled,
      manifestReviewStatus: candidate.manifestReviewStatus,
      runtimeSupportsNativeLoading:
        runtimeSupportsProvenNativePluginLoading(runtimeSupportInput),
      runtimeSupportsPerRunPluginControl:
        runtimeSupportsProvenPerRunPluginControl(runtimeSupportInput),
      identity: candidate.identity,
      reviewedIdentityFingerprint: candidate.reviewedIdentityFingerprint,
      identityIncompleteAcknowledgedFingerprint:
        candidate.identityIncompleteAcknowledgedFingerprint,
      hasMcpServers: candidate.hasMcpServers,
      mcpServersApprovedOrFiltered: candidate.mcpServersApprovedOrFiltered,
      nativeLoadFailure: candidate.nativeLoadFailure,
    })

    const previous = byPluginId.get(pluginId)
    if (previous?.enabled) continue

    if (nativeActivationPolicy.canActivateNative || !previous) {
      byPluginId.set(pluginId, {
        pluginId,
        pluginSource: candidate.plugin.source,
        enabled: nativeActivationPolicy.canActivateNative,
        pluginPath: candidate.plugin.path,
        cacheCoordinates: getCodexAppServerPluginCacheCoordinates(
          candidate.plugin,
        ),
        nativeActivationPolicy,
      })
    }
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

function isSafeCodexPluginCacheSegment(value: string): boolean {
  if (!value || value === "." || value === "..") return false
  return !/[\\/]/.test(value)
}
