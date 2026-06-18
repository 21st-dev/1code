import type { PluginUpdateReviewStatus } from "../../../shared/plugin-update-review"
import type { PluginInfo } from "../plugins"
import {
  buildRuntimeNativeActivationPolicy,
  type RuntimeNativeActivationIdentity,
  type RuntimeNativeActivationPolicy,
} from "../plugins/runtime-native-activation"

export interface CodexAppServerPluginConfigEntry {
  pluginId: string
  pluginSource: string
  enabled: boolean
}

export interface CodexAppServerPluginConfigOverrides {
  config: Record<string, boolean>
  entries: CodexAppServerPluginConfigEntry[]
}

export interface CodexAppServerPluginActivationCandidate {
  plugin: Pick<PluginInfo, "runtime" | "marketplace" | "source">
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

export function buildCodexAppServerPluginConfigOverrides(input: {
  plugins: Array<Pick<PluginInfo, "runtime" | "marketplace" | "source">>
  allowedPluginSources: string[]
}): CodexAppServerPluginConfigOverrides {
  const allowedSources = new Set(input.allowedPluginSources)
  const enabledByPluginId = new Map<string, boolean>()
  const sourceByPluginId = new Map<string, string>()

  for (const plugin of input.plugins) {
    const pluginId = getCodexAppServerPluginId(plugin)
    if (!pluginId) continue

    const enabled = allowedSources.has(plugin.source)
    enabledByPluginId.set(
      pluginId,
      (enabledByPluginId.get(pluginId) ?? false) || enabled,
    )
    if (enabled || !sourceByPluginId.has(pluginId)) {
      sourceByPluginId.set(pluginId, plugin.source)
    }
  }

  const entries = Array.from(enabledByPluginId.entries())
    .map(([pluginId, enabled]) => ({
      pluginId,
      pluginSource: sourceByPluginId.get(pluginId) ?? "",
      enabled,
    }))
    .sort((a, b) => a.pluginId.localeCompare(b.pluginId))

  const config: Record<string, boolean> = {}
  for (const entry of entries) {
    config[`plugins.${entry.pluginId}.enabled`] = entry.enabled
  }

  return { config, entries }
}

export function buildCodexAppServerResolvedPluginConfigOverrides(input: {
  candidates: CodexAppServerPluginActivationCandidate[]
}): CodexAppServerResolvedPluginConfigOverrides {
  const byPluginId = new Map<string, CodexAppServerResolvedPluginConfigEntry>()

  for (const candidate of input.candidates) {
    const pluginId = getCodexAppServerPluginId(candidate.plugin)
    if (!pluginId) continue

    const nativeActivationPolicy = buildRuntimeNativeActivationPolicy({
      pluginEnabled: candidate.pluginEnabled,
      safeModeEnabled: candidate.safeModeEnabled,
      manifestReviewStatus: candidate.manifestReviewStatus,
      runtimeSupportsNativeLoading: true,
      runtimeSupportsPerRunPluginControl: true,
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
