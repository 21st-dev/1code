export type PluginEntryMode = "browse" | "manage"
export type PluginTopTabId = "plugins" | "skills"
export type PluginManageTabId =
  | "plugins"
  | "apps"
  | "mcps"
  | "skills"
  | "marketplace"
export type PluginSourceTabId = "openai" | "mine"
export type PluginMutationStatus = "pending" | "success" | "error"
export type PluginResourceRouteKind =
  | "app"
  | "mcp"
  | "managed-skill"
  | "recommended-skill"
export type PluginResourceRouteActionId =
  | "manage"
  | "connect-oauth"
  | "open-mcp-capability"
  | "try-in-chat"
  | "install-skill"
  | "unavailable"

export type PluginRouteOrigin = {
  topTab: PluginTopTabId
  entryMode: PluginEntryMode
  manageTab: PluginManageTabId
  sourceTab: PluginSourceTabId
  searchQuery: string
}

export type PluginBrowseRouteState = {
  surface: "browse"
  topTab: "plugins"
  entryMode: "browse"
  sourceTab: PluginSourceTabId
  searchQuery: string
}

export type PluginManageRouteState = {
  surface: "manage"
  topTab: "plugins"
  entryMode: "manage"
  manageTab: PluginManageTabId
  sourceTab: PluginSourceTabId
  searchQuery: string
}

export type PluginSkillsRouteState = {
  surface: "skills"
  topTab: "skills"
  entryMode: "browse"
  sourceTab: PluginSourceTabId
  searchQuery: string
}

export type PluginDetailRouteState = {
  surface: "detail"
  pluginId: string
  origin: PluginRouteOrigin
  lastAction?: {
    type: "install" | "uninstall"
    status: "success" | "error"
  }
}

export type PluginInstallRouteState = {
  surface: "install"
  pluginId: string
  origin: PluginRouteOrigin
  status: Extract<PluginMutationStatus, "pending">
}

export type PluginUninstallRouteState = {
  surface: "uninstall"
  pluginId: string
  origin: PluginRouteOrigin
  status: "confirming" | Extract<PluginMutationStatus, "pending" | "error">
}

export type PluginTryInChatRouteState = {
  surface: "try-in-chat"
  pluginId: string
  origin: PluginRouteOrigin
  promptKey?: string
}

export type PluginResourceRouteState = {
  surface: "resource"
  resourceId: string
  resourceKind: PluginResourceRouteKind
  actionId: PluginResourceRouteActionId
  origin: PluginRouteOrigin
  promptKey?: string
  targetId?: string
}

export type PluginRouteState =
  | PluginBrowseRouteState
  | PluginManageRouteState
  | PluginSkillsRouteState
  | PluginDetailRouteState
  | PluginInstallRouteState
  | PluginUninstallRouteState
  | PluginTryInChatRouteState
  | PluginResourceRouteState

export type BuildPluginRouteOptions = {
  pageTab: PluginTopTabId
  entryMode: PluginEntryMode
  manageTab?: PluginManageTabId
  sourceTab?: PluginSourceTabId
  searchQuery?: string
}

const DEFAULT_MANAGE_TAB: PluginManageTabId = "plugins"
const DEFAULT_SOURCE_TAB: PluginSourceTabId = "openai"

export function getPluginRouteOrigin(
  options: BuildPluginRouteOptions,
): PluginRouteOrigin {
  return {
    topTab: options.pageTab,
    entryMode: options.pageTab === "skills" ? "browse" : options.entryMode,
    manageTab: options.manageTab ?? DEFAULT_MANAGE_TAB,
    sourceTab: options.sourceTab ?? DEFAULT_SOURCE_TAB,
    searchQuery: options.searchQuery ?? "",
  }
}

export function buildPluginBrowseRoute(
  options: BuildPluginRouteOptions,
): PluginBrowseRouteState | PluginManageRouteState | PluginSkillsRouteState {
  const origin = getPluginRouteOrigin(options)

  if (origin.topTab === "skills") {
    return {
      surface: "skills",
      topTab: "skills",
      entryMode: "browse",
      sourceTab: origin.sourceTab,
      searchQuery: origin.searchQuery,
    }
  }

  if (origin.entryMode === "manage") {
    return {
      surface: "manage",
      topTab: "plugins",
      entryMode: "manage",
      manageTab: origin.manageTab,
      sourceTab: origin.sourceTab,
      searchQuery: origin.searchQuery,
    }
  }

  return {
    surface: "browse",
    topTab: "plugins",
    entryMode: "browse",
    sourceTab: origin.sourceTab,
    searchQuery: origin.searchQuery,
  }
}

export function getPluginRouteOriginFromState(
  route: PluginRouteState,
): PluginRouteOrigin {
  if ("origin" in route) return route.origin

  return getPluginRouteOrigin({
    pageTab: route.topTab,
    entryMode: route.entryMode,
    manageTab: route.surface === "manage" ? route.manageTab : DEFAULT_MANAGE_TAB,
    sourceTab: route.sourceTab,
    searchQuery: route.searchQuery,
  })
}

export function openPluginDetailRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
): PluginDetailRouteState {
  return {
    surface: "detail",
    pluginId,
    origin,
  }
}

export function closePluginOverlayRoute(
  route: PluginRouteState,
): PluginBrowseRouteState | PluginManageRouteState | PluginSkillsRouteState {
  return buildPluginBrowseRoute(pluginRouteToLegacyTabs(route))
}

export function startPluginInstallRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
): PluginInstallRouteState {
  return {
    surface: "install",
    pluginId,
    origin,
    status: "pending",
  }
}

export function finishPluginInstallRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
  status: Extract<PluginMutationStatus, "success" | "error">,
): PluginDetailRouteState {
  return {
    surface: "detail",
    pluginId,
    origin,
    lastAction: {
      type: "install",
      status,
    },
  }
}

export function requestPluginUninstallRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
): PluginUninstallRouteState {
  return {
    surface: "uninstall",
    pluginId,
    origin,
    status: "confirming",
  }
}

export function startPluginUninstallRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
): PluginUninstallRouteState {
  return {
    surface: "uninstall",
    pluginId,
    origin,
    status: "pending",
  }
}

export function finishPluginUninstallRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
  status: Extract<PluginMutationStatus, "success" | "error">,
): PluginDetailRouteState | PluginUninstallRouteState {
  if (status === "error") {
    return {
      surface: "uninstall",
      pluginId,
      origin,
      status: "error",
    }
  }

  return {
    surface: "detail",
    pluginId,
    origin,
    lastAction: {
      type: "uninstall",
      status,
    },
  }
}

export function cancelPluginUninstallRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
): PluginDetailRouteState {
  return openPluginDetailRoute(pluginId, origin)
}

export function startPluginTryInChatRoute(
  pluginId: string,
  origin: PluginRouteOrigin,
  promptKey?: string,
): PluginTryInChatRouteState {
  return {
    surface: "try-in-chat",
    pluginId,
    origin,
    promptKey,
  }
}

export function openPluginResourceRoute({
  actionId,
  origin,
  promptKey,
  resourceId,
  resourceKind,
  targetId,
}: {
  actionId: PluginResourceRouteActionId
  origin: PluginRouteOrigin
  promptKey?: string
  resourceId: string
  resourceKind: PluginResourceRouteKind
  targetId?: string
}): PluginResourceRouteState {
  return {
    surface: "resource",
    resourceId,
    resourceKind,
    actionId,
    origin,
    promptKey,
    targetId,
  }
}

export function pluginRouteToLegacyTabs(
  route: PluginRouteState,
): Required<BuildPluginRouteOptions> {
  const origin = getPluginRouteOriginFromState(route)

  return {
    pageTab: origin.topTab,
    entryMode: origin.entryMode,
    manageTab: origin.manageTab,
    sourceTab: origin.sourceTab,
    searchQuery: origin.searchQuery,
  }
}

export function getPluginRouteDialogKind(
  route: PluginRouteState,
): "detail" | "uninstall" | null {
  if (route.surface === "detail" || route.surface === "install") {
    return "detail"
  }

  if (route.surface === "uninstall") return "uninstall"

  return null
}

export function serializePluginRouteOrigin(origin: PluginRouteOrigin): string {
  if (origin.topTab === "skills") {
    return `skills:${origin.sourceTab}`
  }

  if (origin.entryMode === "manage") {
    return `plugins:manage:${origin.manageTab}:${origin.sourceTab}`
  }

  return `plugins:browse:${origin.sourceTab}`
}

export function serializePluginRouteState(route: PluginRouteState): string {
  if (route.surface === "resource") {
    const origin = serializePluginRouteOrigin(route.origin)
    const target = route.targetId ? `:${route.targetId}` : ""
    return `resource:${route.resourceKind}:${route.resourceId}:${route.actionId}:${origin}${target}`
  }

  if (!("pluginId" in route)) {
    return serializePluginRouteOrigin(getPluginRouteOriginFromState(route))
  }

  const origin = serializePluginRouteOrigin(route.origin)

  if (route.surface === "detail") {
    const action = route.lastAction
      ? `:${route.lastAction.type}-${route.lastAction.status}`
      : ""
    return `detail:${route.pluginId}:${origin}${action}`
  }

  if (route.surface === "install") {
    return `install:${route.pluginId}:${route.status}:${origin}`
  }

  if (route.surface === "uninstall") {
    return `uninstall:${route.pluginId}:${route.status}:${origin}`
  }

  return route.promptKey
    ? `try-in-chat:${route.pluginId}:${route.promptKey}:${origin}`
    : `try-in-chat:${route.pluginId}:${origin}`
}
