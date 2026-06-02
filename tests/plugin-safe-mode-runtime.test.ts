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
  const claudeConfigSource = readFileSync(
    join(process.cwd(), "src/main/lib/claude-config.ts"),
    "utf8",
  )
  const pluginsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/plugins.ts"),
    "utf8",
  )
  const pluginReviewScanSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/review-scan.ts"),
    "utf8",
  )
  const pluginControlledUiSource = readFileSync(
    join(process.cwd(), "src/shared/plugin-controlled-ui.ts"),
    "utf8",
  )
  const pluginControlledUiStateSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/controlled-ui-state.ts"),
    "utf8",
  )
  const commandsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/commands.ts"),
    "utf8",
  )
  const skillsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/skills.ts"),
    "utf8",
  )
  const agentsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/agents.ts"),
    "utf8",
  )
  const agentUtilsSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/agent-utils.ts"),
    "utf8",
  )
  const runtimeGatesSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/runtime-gates.ts"),
    "utf8",
  )

  test("discovers plugin MCP servers with review gates derived in main", () => {
    expect(pluginIndexSource).toContain("recordPluginReviewScans")
    expect(pluginIndexSource).toContain("reviewGate")
    expect(pluginIndexSource).toContain("buildPluginSafetyGate")
    expect(pluginIndexSource).not.toContain("mcpCache")
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
    expect(claudeRouterSource).not.toContain("ensureSymlink(\n                    pluginsSource")
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
    expect(mcpAuthSource).toContain("_locusPluginMcp")
    expect(claudeRouterSource).toContain("getEffectivePluginMcpServerConfig")
    expect(claudeConfigSource).toContain("filterLocusPluginMcpServers")
    expect(claudeConfigSource).toContain("getMatchingLocusPluginMcpServerConfig")
  })

  test("exposes safe mode state and per-plugin gates through the plugins API", () => {
    expect(pluginsRouterSource).toContain("safeMode: publicProcedure.query")
    expect(pluginsRouterSource).toContain("setSafeMode: publicProcedure")
    expect(pluginsRouterSource).toContain("safetyGate")
  })

  test("gates plugin commands, skills, and agents before runtime discovery", () => {
    expect(runtimeGatesSource).toContain("discoverAllowedClaudePluginRuntimeComponents")
    expect(runtimeGatesSource).toContain("safetyGate.status !== \"allowed\"")
    expect(runtimeGatesSource).toContain("recordPluginReviewScans")
    expect(commandsRouterSource).toContain("discoverAllowedClaudePluginRuntimeComponents")
    expect(skillsRouterSource).toContain("discoverAllowedClaudePluginRuntimeComponents")
    expect(agentsRouterSource).toContain("discoverAllowedClaudePluginRuntimeComponents")
    expect(agentUtilsSource).toContain("discoverAllowedClaudePluginRuntimeComponents")
    expect(commandsRouterSource).not.toContain("discoverInstalledPlugins")
    expect(skillsRouterSource).not.toContain("discoverInstalledPlugins")
    expect(agentsRouterSource).not.toContain("discoverInstalledPlugins")
    expect(agentUtilsSource).not.toContain("discoverInstalledPlugins")
  })

  test("keeps controlled UI declarative and gates action invocation in main", () => {
    expect(pluginReviewScanSource).toContain(".locus-plugin")
    expect(pluginReviewScanSource).toContain("parseControlledUiManifest")
    expect(pluginReviewScanSource).toContain("fs.realpath")
    expect(pluginReviewScanSource).not.toContain("import(")
    expect(pluginReviewScanSource).not.toContain("require(")
    expect(pluginReviewScanSource).not.toContain("new Function")

    expect(pluginControlledUiSource).toContain("UNSAFE_FIELD_NAMES")
    expect(pluginControlledUiSource).toContain("dangerouslySetInnerHTML")
    expect(pluginControlledUiSource).toContain("webview")
    expect(pluginControlledUiSource).toContain("iframe")
    expect(pluginControlledUiSource).not.toContain("eval(")

    expect(pluginsRouterSource).toContain("grantControlledAction")
    expect(pluginsRouterSource).toContain("invokeControlledAction")
    expect(pluginsRouterSource).toContain("getControlledUiActionContext")
    expect(pluginsRouterSource).toContain("recordPluginReviewScans")
    expect(pluginsRouterSource).toContain("getControlledUiPermissionGrantStatus")
    expect(pluginsRouterSource).toContain("canInvokeControlledAction")
    expect(pluginsRouterSource).not.toContain("executeControlledActionShell")
    expect(pluginsRouterSource).not.toContain("sendChatAutomatically")

    expect(pluginControlledUiStateSource).toContain("contributionFingerprint")
    expect(pluginControlledUiStateSource).toContain("getControlledUiGrantStatus")
  })
})
