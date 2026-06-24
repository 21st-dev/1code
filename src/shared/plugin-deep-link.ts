export type PluginDeepLinkAction = "detail" | "try-in-chat"

export type PluginDeepLinkSource = "protocol" | "mention" | "catalog"

export type PluginDeepLinkTarget = {
  pluginId: string
  action: PluginDeepLinkAction
  source?: PluginDeepLinkSource
}

const TRY_IN_CHAT_ACTIONS = new Set(["try", "try-in-chat", "tryInChat"])
const PLUGIN_DEEP_LINK_PROTOCOLS = new Set([
  "twentyfirst-agents:",
  "twentyfirst-agents-dev:",
])

function normalizePluginDeepLinkAction(value: string | null): PluginDeepLinkAction {
  if (!value) return "detail"
  return TRY_IN_CHAT_ACTIONS.has(value) ? "try-in-chat" : "detail"
}

export function buildPluginDeepLinkUrl({
  action = "detail",
  pluginId,
  protocol,
}: {
  action?: PluginDeepLinkAction
  pluginId: string
  protocol: string
}): string {
  const encodedPluginId = encodeURIComponent(pluginId)

  if (action === "try-in-chat") {
    return `${protocol}://plugins/${encodedPluginId}/try-in-chat`
  }

  return `${protocol}://plugins/${encodedPluginId}`
}

export function parsePluginDeepLink(url: string): PluginDeepLinkTarget | null {
  const trimmed = url.trim()
  if (!trimmed) return null

  let parsed: URL
  const hasProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)

  try {
    parsed = hasProtocol
      ? new URL(trimmed)
      : new URL(trimmed, "twentyfirst-agents://local")
  } catch {
    return null
  }

  if (hasProtocol && !PLUGIN_DEEP_LINK_PROTOCOLS.has(parsed.protocol)) {
    return null
  }

  if (parsed.host !== "plugins" && !parsed.pathname.startsWith("/plugins/")) {
    return null
  }

  const pathParts = parsed.pathname.split("/").filter(Boolean)
  const rawPluginId = parsed.host === "plugins" ? pathParts[0] : pathParts[1]

  if (!rawPluginId) return null

  const pathAction = parsed.host === "plugins" ? pathParts[1] : pathParts[2]
  const queryAction =
    parsed.searchParams.get("action") ??
    parsed.searchParams.get("intent") ??
    (parsed.searchParams.get("tryInChat") === "true" ? "try-in-chat" : null)

  return {
    pluginId: decodeURIComponent(rawPluginId),
    action: normalizePluginDeepLinkAction(pathAction ?? queryAction),
    source: "protocol",
  }
}
