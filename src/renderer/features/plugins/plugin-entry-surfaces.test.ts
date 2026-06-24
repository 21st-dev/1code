import { describe, expect, test } from "bun:test"
import {
  buildPluginEntrySurfaceRoute,
  coercePluginManageTabForSurface,
  getDesktopViewForSettingsIntegration,
  getPluginEntrySurfaceDefaults,
  getPluginEntrySurfaceForDesktopView,
  getPluginEntrySurfaceManageTabIds,
} from "./plugin-entry-surfaces"

describe("Codex plugin entry surfaces", () => {
  test("routes Settings integrations to independent desktop surfaces", () => {
    expect(getDesktopViewForSettingsIntegration("plugins")).toBe("plugins")
    expect(getDesktopViewForSettingsIntegration("skills")).toBe("skills")
    expect(getDesktopViewForSettingsIntegration("mcp")).toBe("mcp-settings")
    expect(getDesktopViewForSettingsIntegration("preferences")).toBeNull()
  })

  test("keeps Plugins, Skills, and MCP as separate page contracts", () => {
    expect(getPluginEntrySurfaceForDesktopView("plugins")).toBe("plugins")
    expect(getPluginEntrySurfaceForDesktopView("skills")).toBe("skills")
    expect(getPluginEntrySurfaceForDesktopView("mcp-settings")).toBe(
      "mcp-settings",
    )

    expect(getPluginEntrySurfaceDefaults("plugins")).toEqual({
      pageTab: "plugins",
      entryMode: "browse",
      manageTab: "plugins",
    })
    expect(getPluginEntrySurfaceDefaults("skills")).toEqual({
      pageTab: "skills",
      entryMode: "browse",
      manageTab: "skills",
    })
    expect(getPluginEntrySurfaceDefaults("mcp-settings")).toEqual({
      pageTab: "plugins",
      entryMode: "manage",
      manageTab: "mcps",
    })
  })

  test("prevents the Plugins page from owning Skills and MCP tabs", () => {
    expect(getPluginEntrySurfaceManageTabIds("plugins")).toEqual([
      "plugins",
      "apps",
      "marketplace",
    ])
    expect(getPluginEntrySurfaceManageTabIds("skills")).toEqual(["skills"])
    expect(getPluginEntrySurfaceManageTabIds("mcp-settings")).toEqual(["mcps"])

    expect(coercePluginManageTabForSurface("plugins", "mcps")).toBe("plugins")
    expect(coercePluginManageTabForSurface("skills", "plugins")).toBe("skills")
    expect(coercePluginManageTabForSurface("mcp-settings", "skills")).toBe(
      "mcps",
    )
  })

  test("builds MCP as a manage route without reusing the Plugins surface", () => {
    expect(buildPluginEntrySurfaceRoute("mcp-settings")).toMatchObject({
      surface: "manage",
      topTab: "plugins",
      entryMode: "manage",
      manageTab: "mcps",
    })
    expect(buildPluginEntrySurfaceRoute("skills")).toMatchObject({
      surface: "skills",
      topTab: "skills",
      entryMode: "browse",
    })
  })
})
