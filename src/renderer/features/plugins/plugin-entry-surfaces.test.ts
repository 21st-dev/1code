import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import {
  buildPluginEntrySurfaceRoute,
  coercePluginManageTabForSurface,
  getDesktopViewForSettingsIntegration,
  getPluginEntrySurfaceDefaults,
  getPluginEntrySurfaceForDesktopView,
  getPluginEntrySurfaceManageTabIds,
} from "./plugin-entry-surfaces"

describe("Codex plugin entry surfaces", () => {
  test("keeps Settings integrations inside the Settings page", () => {
    expect(getDesktopViewForSettingsIntegration("plugins")).toBeNull()
    expect(getDesktopViewForSettingsIntegration("skills")).toBeNull()
    expect(getDesktopViewForSettingsIntegration("mcp")).toBeNull()
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

  test("allows the full Plugins page to inspect all managed resource tabs", () => {
    expect(getPluginEntrySurfaceManageTabIds("plugins")).toEqual([
      "plugins",
      "apps",
      "mcps",
      "skills",
      "marketplace",
    ])
    expect(getPluginEntrySurfaceManageTabIds("skills")).toEqual(["skills"])
    expect(getPluginEntrySurfaceManageTabIds("mcp-settings")).toEqual(["mcps"])

    expect(coercePluginManageTabForSurface("plugins", "mcps")).toBe("mcps")
    expect(coercePluginManageTabForSurface("plugins", "skills")).toBe("skills")
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

  test("resets plugin entry state when the sidebar reopens the same surface", async () => {
    const source = await readFile(
      new URL("./plugin-entry-view.tsx", import.meta.url),
      "utf8",
    )

    expect(source).toContain("pluginEntryNavigationNonceAtom")
    expect(source).toContain("const resetPluginEntrySurface = useCallback")
    expect(source).toContain("setSelectedPlugin(null)")
    expect(source).toContain("setPluginRouteState(buildPluginEntrySurfaceRoute(surface))")
    expect(source).toContain("[pluginEntryNavigationNonce, resetPluginEntrySurface]")
  })

  test("keeps plugin detail resource actions wired", async () => {
    const source = await readFile(
      new URL("./plugin-entry-view.tsx", import.meta.url),
      "utf8",
    )

    expect(source).toContain('data-plugin-detail-resource-action="configure-mcp"')
    expect(source).toContain('onConfigureMcp={() => openPluginManageTab("mcps")}')
    expect(source).toContain('data-plugin-detail-resource-action="toggle-skill"')
    expect(source).toContain('data-plugin-detail-copy-state={copiedLink ? "copied" : "idle"}')
    expect(source).toContain("toggleCatalogPluginSkill(selectedPlugin, skillName, nextEnabled)")
    expect(source).toContain("getDetailSkillKey(plugin.id, skillName)")
  })
})
