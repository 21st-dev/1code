import type { SettingsTab } from "../../lib/atoms"
import type { DesktopView } from "../agents/atoms"
import {
  buildPluginBrowseRoute,
  type PluginEntryMode,
  type PluginManageTabId,
  type PluginRouteState,
  type PluginTopTabId,
} from "./plugin-route-state"

export type PluginEntrySurface = "plugins" | "skills" | "mcp-settings"

export type PluginEntrySurfaceDefaults = {
  pageTab: PluginTopTabId
  entryMode: PluginEntryMode
  manageTab: PluginManageTabId
}

const PLUGIN_ENTRY_SURFACE_DEFAULTS: Record<
  PluginEntrySurface,
  PluginEntrySurfaceDefaults
> = {
  plugins: {
    pageTab: "plugins",
    entryMode: "browse",
    manageTab: "plugins",
  },
  skills: {
    pageTab: "skills",
    entryMode: "browse",
    manageTab: "skills",
  },
  "mcp-settings": {
    pageTab: "plugins",
    entryMode: "manage",
    manageTab: "mcps",
  },
}

const PLUGIN_ENTRY_SURFACE_MANAGE_TABS: Record<
  PluginEntrySurface,
  PluginManageTabId[]
> = {
  plugins: ["plugins", "apps", "marketplace"],
  skills: ["skills"],
  "mcp-settings": ["mcps"],
}

export function getPluginEntrySurfaceDefaults(
  surface: PluginEntrySurface,
): PluginEntrySurfaceDefaults {
  return PLUGIN_ENTRY_SURFACE_DEFAULTS[surface]
}

export function buildPluginEntrySurfaceRoute(
  surface: PluginEntrySurface,
): PluginRouteState {
  return buildPluginBrowseRoute(getPluginEntrySurfaceDefaults(surface))
}

export function getPluginEntrySurfaceManageTabIds(
  surface: PluginEntrySurface,
): PluginManageTabId[] {
  return PLUGIN_ENTRY_SURFACE_MANAGE_TABS[surface]
}

export function coercePluginManageTabForSurface(
  surface: PluginEntrySurface,
  tab: PluginManageTabId,
): PluginManageTabId {
  const allowedTabs = getPluginEntrySurfaceManageTabIds(surface)
  return allowedTabs.includes(tab) ? tab : allowedTabs[0]
}

export function getPluginEntrySurfaceForDesktopView(
  view: DesktopView,
): PluginEntrySurface | null {
  if (view === "plugins") return "plugins"
  if (view === "skills") return "skills"
  if (view === "mcp-settings") return "mcp-settings"
  return null
}

export function getDesktopViewForSettingsIntegration(
  tab: SettingsTab,
): DesktopView {
  if (tab === "plugins") return "plugins"
  if (tab === "skills") return "skills"
  if (tab === "mcp") return "mcp-settings"
  return null
}
