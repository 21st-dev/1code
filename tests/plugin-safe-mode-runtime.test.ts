import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("plugin safe mode runtime source guards", () => {
  const claudeRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/claude.ts"),
    "utf8",
  )
  const claudeConfigDirSource = readFileSync(
    join(process.cwd(), "src/main/lib/claude/agent-sdk-config-dir.ts"),
    "utf8",
  )
  const claudeRuntimeStartupSource = readFileSync(
    join(process.cwd(), "src/main/lib/claude/agent-sdk-runtime-startup.ts"),
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
  const pluginDeveloperLoaderSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/developer-loader.ts"),
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
  const pluginDeveloperTrustedSource = readFileSync(
    join(process.cwd(), "src/shared/plugin-developer-trusted.ts"),
    "utf8",
  )
  const pluginReviewStateSource = readFileSync(
    join(process.cwd(), "src/main/lib/plugins/update-review-state.ts"),
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

  test("writes filtered plugin settings and staging while plugin safe mode is enforced", () => {
    expect(claudeRouterSource).not.toContain("ensureClaudeAgentSdkIsolatedConfigDir")
    expect(claudeRuntimeStartupSource).toContain(
      "ensureClaudeAgentSdkIsolatedConfigDir",
    )
    expect(claudeConfigDirSource).toContain("ensureClaudeAgentSdkIsolatedConfigDir")
    expect(claudeConfigDirSource).toContain("getPluginSafeModeState")
    expect(claudeConfigDirSource).toContain("stageClaudePlugins({")
    expect(claudeConfigDirSource).toContain("writeFilteredSettings({")
    expect(claudeConfigDirSource).toContain("getClaudePluginStagingEntries")
    expect(claudeConfigDirSource).toContain("pluginSafeMode.enabled")
    expect(claudeConfigDirSource).not.toContain("pluginsSource")
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

  test("reports Claude runtime-native activation from staged config and MCP approvals", () => {
    expect(pluginsRouterSource).toContain("getApprovedPluginMcpServers")
    expect(pluginsRouterSource).toContain("buildRuntimeNativeActivationState")
    expect(pluginsRouterSource).not.toContain("areScannedPluginMcpServersApproved")
    expect(pluginsRouterSource).not.toContain("supportsCodexNativeLoading")
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
    expect(pluginControlledUiSource).toContain("className")
    expect(pluginControlledUiSource).toContain("shell")
    expect(pluginControlledUiSource).toContain("mcp")
    expect(pluginControlledUiSource).toContain("SENSITIVE_SETTING_PATTERN")
    expect(pluginControlledUiSource).not.toContain("eval(")

    expect(pluginsRouterSource).toContain("grantControlledAction")
    expect(pluginsRouterSource).toContain("invokeControlledAction")
    expect(pluginsRouterSource).toContain("setControlledSetting")
    expect(pluginsRouterSource).toContain("getControlledUiActionContext")
    expect(pluginsRouterSource).toContain("getControlledUiSettingContext")
    expect(pluginsRouterSource).toContain("recordPluginReviewScans")
    expect(pluginsRouterSource).toContain("getControlledUiPermissionGrantStatus")
    expect(pluginsRouterSource).toContain("setControlledUiSettingValue")
    expect(pluginsRouterSource).toContain("canInvokeControlledAction")
    expect(pluginsRouterSource).not.toContain("executeControlledActionShell")
    expect(pluginsRouterSource).not.toContain("sendChatAutomatically")

    expect(pluginControlledUiStateSource).toContain("contributionFingerprint")
    expect(pluginControlledUiStateSource).toContain("getControlledUiGrantStatus")
    expect(pluginControlledUiStateSource).toContain("getControlledUiSettingsValues")
  })

  test("keeps developer trusted plugins behind explicit local source and fingerprint gates", () => {
    expect(pluginIndexSource).toContain("discoverDeveloperTrustedPlugins")
    expect(pluginIndexSource).toContain("getDeveloperPluginSources")
    expect(pluginIndexSource).toContain("parseDeveloperTrustedManifest")
    expect(pluginIndexSource).toContain("MAX_DEVELOPER_DISCOVERY_MANIFEST_BYTES")
    expect(pluginIndexSource).toContain("sourceKind: \"developer-local\"")
    expect(pluginIndexSource).toContain("getDeveloperTrustedPluginTargetMode")

    expect(pluginReviewScanSource).toContain("scanDeveloperTrustedManifest")
    expect(pluginReviewScanSource).toContain("scanDeveloperEntry")
    expect(pluginReviewScanSource).toContain("entryContentHash")
    expect(pluginReviewScanSource).toContain("bundleContentHash")
    expect(pluginReviewScanSource).toContain("MAX_DEVELOPER_BUNDLE_BYTES")
    expect(pluginReviewScanSource).toContain("fs.realpath")
    expect(pluginReviewScanSource).not.toContain("new Function")
    expect(pluginReviewScanSource).not.toContain("require(")

    expect(pluginDeveloperLoaderSource).toContain("loadDeveloperTrustedPlugin")
    expect(pluginDeveloperLoaderSource).toContain("recordPluginReviewScans")
    expect(pluginDeveloperLoaderSource).toContain("getPluginDeveloperModeState")
    expect(pluginDeveloperLoaderSource).toContain("getDeveloperPluginTrustStatus")
    expect(pluginDeveloperLoaderSource).toContain("buildPluginDeveloperTrustedGate")
    expect(pluginDeveloperLoaderSource).toContain("pathToFileURL")
    expect(pluginDeveloperLoaderSource).toContain("import(url.href)")
    expect(pluginDeveloperLoaderSource).not.toContain("child_process")

    expect(pluginDeveloperTrustedSource).toContain("canTrustCurrentFingerprint")
    expect(pluginDeveloperTrustedSource).toContain("canLoadTrustedCode")
    expect(pluginDeveloperTrustedSource).toContain("developer-mode-disabled")
    expect(pluginDeveloperTrustedSource).toContain("safe-mode")
    expect(pluginDeveloperTrustedSource).toContain("unsupported-source")
    expect(pluginDeveloperTrustedSource).toContain("trust-stale")

    expect(pluginReviewStateSource).toContain("setPluginDeveloperModeEnabled")
    expect(pluginReviewStateSource).toContain("addDeveloperPluginSource")
    expect(pluginReviewStateSource).toContain("trustDeveloperPluginFingerprint")
    expect(pluginReviewStateSource).toContain("getDeveloperPluginTrustStatus")
    expect(pluginReviewStateSource).toContain("revokeDeveloperPluginTrust")

    expect(pluginsRouterSource).toContain("getPluginDeveloperModeState")
    expect(pluginsRouterSource).toContain("developerTrustedGate")
    expect(pluginsRouterSource).toContain("getDeveloperPluginLoadState")
    expect(pluginsRouterSource).toContain("bundleContentHash")
    expect(pluginsRouterSource).toContain("developerMode: publicProcedure.query")
    expect(pluginsRouterSource).toContain("setDeveloperMode: publicProcedure")
    expect(pluginsRouterSource).toContain("chooseDeveloperSourceDirectory: publicProcedure")
    expect(pluginsRouterSource).toContain("dialog.showOpenDialog")
    expect(pluginsRouterSource).toContain("dialog.showMessageBox")
    expect(pluginsRouterSource).toContain("trustDeveloperPlugin: publicProcedure")
    expect(pluginsRouterSource).toContain("loadDeveloperPlugin: publicProcedure")
    expect(pluginsRouterSource).toContain("buildPluginDeveloperTrustedGate")
    expect(pluginsRouterSource).toContain("getDeveloperPluginTrustStatus")
    expect(pluginsRouterSource).toContain("recordPluginReviewScans")
    expect(pluginsRouterSource).not.toContain("addDeveloperSource: publicProcedure")
  })
})
