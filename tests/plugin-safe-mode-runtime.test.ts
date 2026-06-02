import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("plugin safe mode runtime source guards", () => {
  const claudeRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/claude.ts"),
    "utf8",
  )
  const claudeSettingsSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/claude-settings.ts"),
    "utf8",
  )
  const pluginIndexSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/index.ts"),
    "utf8",
  )
  const mcpAuthSource = readFileSync(
    join(process.cwd(), "src/main/lib/mcp-auth.ts"),
    "utf8",
  )
  const pluginsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/plugins.ts"),
    "utf8",
  )

  test("discovers plugin MCP servers with review gates derived in main", () => {
    expect(pluginIndexSource).toContain("recordPluginReviewScans")
    expect(pluginIndexSource).toContain("reviewGate")
    expect(pluginIndexSource).toContain("buildPluginSafetyGate")
  })

  test("gates plugin MCP runtime inclusion on reviewGate", () => {
    expect(claudeRouterSource).toContain("pluginConfig.reviewGate.canUseMcp")
    expect(claudeRouterSource).toContain("pConfig.reviewGate.canUseMcp")
    expect(claudeRouterSource).toContain("getPluginGateMcpStatus(pluginConfig.reviewGate)")
  })

  test("removes the plugin directory symlink while plugin safe mode is enabled", () => {
    expect(claudeRouterSource).toContain("getPluginSafeModeState")
    expect(claudeRouterSource).toContain("removeManagedSymlink(pluginsTarget")
    expect(claudeRouterSource).toContain("pluginSafeMode.enabled")
  })

  test("gates plugin enablement and MCP approval in Claude settings", () => {
    expect(claudeSettingsSource).toContain("resolvePluginSafetyGateForSource")
    expect(claudeSettingsSource).toContain("assertPluginGateAllows(gate, \"enable\")")
    expect(claudeSettingsSource).toContain("assertPluginGateAllows(gate, \"approve-mcp\")")
    expect(claudeSettingsSource).not.toContain("input.identifiers?.length")
  })

  test("prevents MCP OAuth fallback from bypassing plugin gates", () => {
    expect(mcpAuthSource).toContain("enabledPluginSources.includes(pluginConfig.pluginSource)")
    expect(mcpAuthSource).toContain("pluginConfig.reviewGate.canUseMcp")
    expect(mcpAuthSource).toContain("approvedPluginMcpServers.includes(identifier)")
  })

  test("exposes safe mode state and per-plugin gates through the plugins API", () => {
    expect(pluginsRouterSource).toContain("safeMode: publicProcedure.query")
    expect(pluginsRouterSource).toContain("setSafeMode: publicProcedure")
    expect(pluginsRouterSource).toContain("safetyGate")
  })
})
