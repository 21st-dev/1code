import type { PluginInfo } from "../plugins"

export interface CodexAppServerPluginConfigEntry {
  pluginId: string
  pluginSource: string
  enabled: boolean
}

export interface CodexAppServerPluginConfigOverrides {
  config: Record<string, boolean>
  entries: CodexAppServerPluginConfigEntry[]
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
