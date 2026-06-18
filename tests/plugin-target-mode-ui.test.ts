import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("plugin target mode UI source guards", () => {
  const pluginsTabSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx",
    ),
    "utf8",
  )
  const dictionarySource = readFileSync(
    join(process.cwd(), "src/renderer/lib/i18n/dictionaries.ts"),
    "utf8",
  )
  const pluginsRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/plugins.ts"),
    "utf8",
  )

  test("renders target mode, execution, review, and update posture labels", () => {
    expect(pluginsTabSource).toContain(
      "getTargetModeLabel(plugin.targetMode, t)",
    )
    expect(pluginsTabSource).toContain(
      "getExecutionStatusLabel(plugin.executionStatus, t)",
    )
    expect(pluginsTabSource).toContain(
      "getReviewStatusLabel(plugin.reviewStatus, t)",
    )
    expect(pluginsTabSource).toContain(
      "getUpdatePostureLabel(plugin.updatePosture, t)",
    )
  })

  test("keeps Codex package handling behind Locus runtime-native gates", () => {
    expect(pluginsTabSource).toContain("settings.plugins.codexPackageHint")
    expect(pluginsTabSource).toContain("settings.plugins.codexMcpHint")
    expect(pluginsTabSource).toContain(
      "trpc.plugins.setRuntimeNativeEnabled.useMutation",
    )
    expect(pluginsRouterSource).toContain("setRuntimeNativeEnabled")
    expect(pluginsRouterSource).toContain("buildPluginRuntimeNativeActivation")
    expect(pluginsRouterSource).toContain("setRuntimeNativePluginEnabled")
    expect(pluginsTabSource).not.toContain("codexSettings.setPluginEnabled")
    expect(pluginsTabSource).not.toContain("executeCodexPlugin")
  })

  test("localizes target mode and update handling copy", () => {
    for (const key of [
      "settings.plugins.targetModeManifestOnly",
      "settings.plugins.executionNotRunByLocus",
      "settings.plugins.reviewMcpRequired",
      "settings.plugins.pluginUpdateGuidance",
      "settings.plugins.codexReferenceUpdateGuidance",
      "settings.plugins.codexDesktopUpdateGuidance",
      "settings.plugins.codexRuntimeUpdateGuidance",
      "settings.plugins.safeModePlanningGuidance",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })

  test("renders diagnostics and safe-mode planning copy without execution controls", () => {
    expect(pluginsTabSource).toContain("DiagnosticsPanel")
    expect(pluginsTabSource).toContain("plugin.diagnostics")
    expect(pluginsTabSource).toContain("source.diagnostics")
    expect(pluginsTabSource).toContain("settings.plugins.safeModePlanning")
    expect(pluginsTabSource).not.toContain("runPluginSafeMode")

    for (const key of [
      "settings.plugins.diagnostics",
      "settings.plugins.diagnosticMcpReviewRequired",
      "settings.plugins.diagnosticPermissionScopeReviewRequired",
      "settings.plugins.diagnosticSafeModePlanned",
      "settings.plugins.diagnosticComponentPathOutsideRoot",
      "settings.plugins.diagnosticSourceMissing",
      "settings.plugins.diagnosticSourceReadOnlyRefresh",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })

  test("localizes plugin source detail descriptions and install hints", () => {
    expect(pluginsTabSource).toContain(
      "getSourceDescriptionLabel(source.runtime, t)",
    )
    expect(pluginsTabSource).toContain(
      "getSourceInstallHintLabel(source.runtime, t)",
    )

    for (const key of [
      "settings.plugins.sourceDescriptionClaude",
      "settings.plugins.sourceDescriptionCodex",
      "settings.plugins.sourceInstallHintClaude",
      "settings.plugins.sourceInstallHintCodex",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })

  test("renders advisory plugin update review without fake update or install controls", () => {
    expect(pluginsTabSource).toContain("PluginUpdateReviewPanel")
    expect(pluginsTabSource).toContain("plugin.updateReview")
    expect(pluginsTabSource).toContain("trpc.plugins.markReviewed.useMutation")
    expect(pluginsTabSource).toContain("settings.plugins.updateReview")
    expect(pluginsTabSource).toContain("settings.plugins.markReviewed")
    expect(pluginsTabSource).toContain("settings.plugins.changeSummary")
    expect(pluginsTabSource).toContain("settings.plugins.noSourcePins")
    expect(pluginsTabSource).not.toContain("installPluginUpdate")
    expect(pluginsTabSource).not.toContain("downloadPluginUpdate")
    expect(pluginsTabSource).not.toContain("executeCodexPlugin")

    for (const key of [
      "settings.plugins.updateReviewNew",
      "settings.plugins.updateReviewChanged",
      "settings.plugins.updateReviewReviewed",
      "settings.plugins.markReviewedHint",
      "settings.plugins.toast.reviewed",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })

  test("renders enforceable safe mode gates without trusting renderer approvals", () => {
    expect(pluginsTabSource).toContain("PluginSafeModeControl")
    expect(pluginsTabSource).toContain("PluginSafetyGatePanel")
    expect(pluginsTabSource).toContain("trpc.plugins.safeMode.useQuery")
    expect(pluginsTabSource).toContain("trpc.plugins.setSafeMode.useMutation")
    expect(pluginsTabSource).toContain("plugin.safetyGate.canApproveMcp")
    expect(pluginsTabSource).toContain("plugin.safetyGate.canUseMcp")
    expect(pluginsTabSource).not.toContain(
      "identifiers: plugin.components.mcpServers",
    )

    for (const key of [
      "settings.plugins.safeMode",
      "settings.plugins.safetyGate",
      "settings.plugins.safetyGateHint",
      "settings.plugins.safetyGateReviewRequired",
      "settings.plugins.safetyReasonReviewChanged",
      "settings.plugins.safetyGateBlocksAction",
      "settings.plugins.toast.safeModeEnabled",
      "settings.plugins.toast.safeModeDisabled",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })

  test("renders controlled UI contributions without plugin code execution", () => {
    expect(pluginsTabSource).toContain("PluginControlledUiPanel")
    expect(pluginsTabSource).toContain("plugin.controlledUi.manifest?.surfaces")
    expect(pluginsTabSource).toContain("!plugin.controlledUi.manifestPresent")
    expect(pluginsTabSource).toContain(
      "trpc.plugins.setControlledSetting.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.grantControlledAction.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.invokeControlledAction.useMutation",
    )
    expect(pluginsTabSource).toContain("plugin.controlledUi.settingsValues")
    expect(pluginsTabSource).toContain(
      "navigator.clipboard.writeText(result.prompt)",
    )
    expect(pluginsRouterSource).toContain("setControlledSetting")
    expect(pluginsRouterSource).toContain("setControlledUiSettingValue")
    expect(pluginsRouterSource).toContain("grantControlledAction")
    expect(pluginsRouterSource).toContain("invokeControlledAction")
    expect(pluginsRouterSource).toContain("getControlledUiActionContext")
    expect(pluginsRouterSource).toContain("getControlledUiSettingContext")
    expect(pluginsRouterSource).toContain("buildPluginControlledUiGate")
    expect(pluginsTabSource).not.toContain("dangerouslySetInnerHTML")
    expect(pluginsTabSource).not.toContain("executeCodexPlugin")
    expect(pluginsTabSource).not.toContain("new Function")
    expect(pluginsTabSource).not.toContain("webview")

    for (const key of [
      "settings.plugins.uiContributions",
      "settings.plugins.uiContributionsHint",
      "settings.plugins.contributionSettingUnset",
      "settings.plugins.contributionReasonPermissionRequired",
      "settings.plugins.contributionStatusPermissionStale",
      "settings.plugins.approveControlledAction",
      "settings.plugins.prepareControlledDraft",
      "settings.plugins.controlledActionHint",
      "settings.plugins.toast.controlledActionApproved",
      "settings.plugins.toast.controlledDraftPrepared",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })

  test("renders plugin Doctor and Debug facts without sandbox claims", () => {
    expect(pluginsTabSource).toContain("PluginDoctorSummaryPanel")
    expect(pluginsTabSource).toContain("PluginDebugPanel")
    expect(pluginsTabSource).toContain("getWorstDoctorStatus")
    expect(pluginsTabSource).toContain("trpc.plugins.doctor.useQuery")
    expect(pluginsTabSource).toContain("doctorReport?.plugins.find")
    expect(pluginsTabSource).toContain("settings.plugins.doctor")
    expect(pluginsTabSource).toContain("settings.plugins.debug")
    expect(pluginsTabSource).toContain("debug.developerTrusted.trustStatus")
    expect(pluginsTabSource).toContain(
      "debug.developerTrusted.loadState.status",
    )
    expect(pluginsTabSource).toContain(
      "debug.developerTrusted.bundleContentHash",
    )
    expect(pluginsTabSource).toContain("settings.plugins.doctorDeveloperTrust")
    expect(pluginsTabSource).not.toContain("installPluginUpdate")
    expect(pluginsTabSource).not.toContain("executeCodexPlugin")

    for (const key of [
      "settings.plugins.doctorSummary",
      "settings.plugins.doctorStatusBlocked",
      "settings.plugins.debugHint",
      "settings.plugins.doctorFingerprint",
      "settings.plugins.doctorCheckRuntimeGate",
      "settings.plugins.doctorCheckCodexReadOnly",
      "settings.plugins.doctorCheckMcpApprovalFingerprint",
      "settings.plugins.doctorCheckDeveloperMode",
      "settings.plugins.doctorCheckDeveloperTrustedGate",
      "settings.plugins.doctorCheckDeveloperTrustedLoad",
      "settings.plugins.doctorDeveloperBundleHash",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }

    expect(dictionarySource).toContain(
      "This is not a sandbox or trust certificate",
    )
    expect(dictionarySource).toContain("不是沙箱或可信证书")
  })

  test("renders pinned store candidate review gates without safety claims", () => {
    expect(pluginsTabSource).toContain("PluginStoreCandidateDetail")
    expect(pluginsTabSource).toContain("PluginStoreListItem")
    expect(pluginsTabSource).toContain("trpc.plugins.storeCatalog.useQuery")
    expect(pluginsTabSource).toContain(
      "trpc.plugins.previewStoreCandidate.useQuery",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.approveStoreCandidate.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.installOrUpdateStoreCandidate.useMutation",
    )
    expect(pluginsTabSource).toContain("selectedStorePreview")
    expect(pluginsTabSource).toContain("settings.plugins.storePinWarning")
    expect(pluginsTabSource).toContain("settings.plugins.storeApproveExact")
    expect(pluginsTabSource).toContain(
      "settings.plugins.storeInstallGateBlocksAction",
    )
    expect(pluginsTabSource).toContain(
      'const isInstalledCurrent = review?.status === "installed-current"',
    )
    expect(pluginsTabSource).toContain('review.approvalStatus === "current"')
    expect(pluginsTabSource).toContain("!isInstalledCurrent")
    expect(pluginsTabSource).not.toContain("trustedMarketplace")
    expect(pluginsTabSource).not.toContain("verifiedSafe")

    for (const key of [
      "settings.plugins.viewStore",
      "settings.plugins.store",
      "settings.plugins.searchStorePlaceholder",
      "settings.plugins.storePinWarning",
      "settings.plugins.storeStatusBlockedInvalidPin",
      "settings.plugins.storeApprovalCurrent",
      "settings.plugins.storeCandidateFingerprint",
      "settings.plugins.storePackageHash",
      "settings.plugins.storeApproveExact",
      "settings.plugins.storeInstall",
      "settings.plugins.storeUpdate",
      "settings.plugins.storeActionHint",
      "settings.plugins.sourcePinStoreCommit",
      "settings.plugins.sourcePinStorePackageHash",
      "settings.plugins.doctorCheckStoreCandidate",
      "settings.plugins.doctorCheckStoreApproval",
      "settings.plugins.toast.storeCandidateApproved",
      "settings.plugins.toast.storeCandidateInstalled",
      "settings.plugins.toast.storeCandidateUpdated",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }

    const lowerDictionary = dictionarySource.toLowerCase()
    expect(lowerDictionary).not.toContain("verified safe")
    expect(lowerDictionary).not.toContain("trusted marketplace")
    expect(lowerDictionary).not.toContain("safety certificate for store")
  })

  test("renders runtime marketplaces separately from Locus store with confirmed runtime-owned actions", () => {
    expect(pluginsTabSource).toContain("RuntimeMarketplaceListItem")
    expect(pluginsTabSource).toContain("RuntimeMarketplaceDetail")
    expect(pluginsTabSource).toContain(
      "trpc.plugins.runtimeMarketplaces.useQuery",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.previewRuntimePluginWriteAction.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.executeRuntimePluginWriteAction.useMutation",
    )
    expect(pluginsTabSource).toContain('viewMode === "marketplaces"')
    expect(pluginsTabSource).toContain("settings.plugins.viewMarketplaces")
    expect(pluginsTabSource).toContain("settings.plugins.viewLocusStore")
    expect(pluginsTabSource).toContain("grid grid-cols-2 gap-1")
    expect(pluginsTabSource).toContain("whitespace-nowrap")
    expect(pluginsTabSource).toContain(
      "settings.plugins.runtimeMarketplaceActionBoundaryHint",
    )
    expect(pluginsTabSource).toContain(
      "settings.plugins.runtimeMarketplaceActionPreview",
    )
    expect(pluginsTabSource).toContain("runtimeActionConfirmation ===")
    expect(pluginsTabSource).toContain("actionPreview.targetLabel")
    expect(pluginsTabSource).toContain("getRuntimePluginWriteActions(plugin)")
    expect(pluginsTabSource).toContain(
      "settings.plugins.runtimeMarketplaceNoCodexEnableDisable",
    )
    expect(pluginsTabSource).toContain(
      "settings.plugins.runtimeMarketplaceReportedPlugins",
    )
    expect(pluginsTabSource).toContain("canTargetExistingMarketplace")
    expect(pluginsTabSource).toContain(
      "settings.plugins.runtimeMarketplaceEmptyActionsHint",
    )
    expect(pluginsTabSource).toContain(":empty-marketplaces")
    expect(pluginsTabSource).toContain(
      "settings.plugins.runtimeMarketplacePluginSummary",
    )
    expect(pluginsTabSource).toContain("getRuntimePluginListingStatusLabel")
    expect(pluginsTabSource).toContain("plugin.status")
    expect(pluginsTabSource).toContain("runtime-reported-plugins")
    expect(pluginsTabSource).not.toContain("installRuntimePlugin")
    expect(pluginsTabSource).not.toContain("updateRuntimePlugin")
    expect(pluginsTabSource).not.toContain("removeRuntimePlugin")
    expect(pluginsTabSource).not.toContain("convertCodexPlugin")
    expect(pluginsTabSource).not.toContain("convertClaudePlugin")

    for (const key of [
      "settings.plugins.viewMarketplaces",
      "settings.plugins.viewLocusStore",
      "settings.plugins.searchMarketplacesPlaceholder",
      "settings.plugins.noRuntimeMarketplaces",
      "settings.plugins.runtimeMarketplacesDescription",
      "settings.plugins.runtimeMarketplacesEmptyDescription",
      "settings.plugins.runtimeMarketplaceActionBoundaryHint",
      "settings.plugins.runtimeMarketplaceActions",
      "settings.plugins.runtimeMarketplaceActionPreview",
      "settings.plugins.runtimeMarketplaceConfirmTarget",
      "settings.plugins.runtimeMarketplaceClaudeReloadHint",
      "settings.plugins.runtimePluginActionInstall",
      "settings.plugins.runtimePluginActionUninstall",
      "settings.plugins.runtimeMarketplaceReportedPlugins",
      "settings.plugins.runtimePluginStatusInstalledEnabled",
      "settings.plugins.runtimePluginStatusNotInstalled",
      "settings.plugins.marketplaceRuntimeEmptyTitle",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }

    expect(dictionarySource).toContain("Locus Store")
    expect(dictionarySource).toContain("Locus 商店")
    expect(dictionarySource).toContain(
      "Locus previews the exact runtime CLI command",
    )
    expect(dictionarySource).toContain("预览精确的运行时 CLI 命令")
  })

  test("renders developer trusted plugin controls without renderer path or code execution", () => {
    expect(pluginsTabSource).toContain("PluginDeveloperModeControl")
    expect(pluginsTabSource).toContain("PluginDeveloperTrustPanel")
    expect(pluginsTabSource).toContain("trpc.plugins.developerMode.useQuery")
    expect(pluginsTabSource).toContain(
      "trpc.plugins.setDeveloperMode.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.chooseDeveloperSourceDirectory.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.removeDeveloperSource.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.trustDeveloperPlugin.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.revokeDeveloperPluginTrust.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "trpc.plugins.loadDeveloperPlugin.useMutation",
    )
    expect(pluginsTabSource).toContain(
      "settings.plugins.confirmRemoveDeveloperSource",
    )
    expect(pluginsTabSource).toContain(
      "settings.plugins.confirmRevokeDeveloperTrust",
    )
    expect(pluginsTabSource).toContain("window.confirm")
    expect(pluginsTabSource).toContain(
      "developer.gate.canTrustCurrentFingerprint",
    )
    expect(pluginsTabSource).toContain("developer.gate.canLoadTrustedCode")
    expect(pluginsTabSource).not.toContain("trpc.plugins.addDeveloperSource")
    expect(pluginsTabSource).not.toContain("showOpenDialog")
    expect(pluginsTabSource).not.toContain("import(")
    expect(pluginsTabSource).not.toContain("require(")
    expect(pluginsTabSource).not.toContain("new Function")

    for (const key of [
      "settings.plugins.developerMode",
      "settings.plugins.developerModeHint",
      "settings.plugins.addDeveloperSource",
      "settings.plugins.developerTrustedCode",
      "settings.plugins.developerTrustedHint",
      "settings.plugins.trustDeveloperPlugin",
      "settings.plugins.loadDeveloperPlugin",
      "settings.plugins.revokeDeveloperTrust",
      "settings.plugins.confirmRevokeDeveloperTrust",
      "settings.plugins.confirmRemoveDeveloperSource",
      "settings.plugins.developerGateBlocksAction",
      "settings.plugins.removeDeveloperSource",
      "settings.plugins.toast.developerPluginLoaded",
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }

    expect(dictionarySource).toContain(
      "This can run local plugin code on this machine",
    )
    expect(dictionarySource).toContain("这会在本机运行本地插件代码")
  })
})
