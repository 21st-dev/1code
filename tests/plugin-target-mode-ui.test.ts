import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

describe("plugin target mode UI source guards", () => {
  const pluginsTabSource = readFileSync(
    join(process.cwd(), "src/renderer/components/dialogs/settings-tabs/agents-plugins-tab.tsx"),
    "utf8",
  )
  const dictionarySource = readFileSync(
    join(process.cwd(), "src/renderer/lib/i18n/dictionaries.ts"),
    "utf8",
  )

  test("renders target mode, execution, review, and update posture labels", () => {
    expect(pluginsTabSource).toContain("getTargetModeLabel(plugin.targetMode, t)")
    expect(pluginsTabSource).toContain("getExecutionStatusLabel(plugin.executionStatus, t)")
    expect(pluginsTabSource).toContain("getReviewStatusLabel(plugin.reviewStatus, t)")
    expect(pluginsTabSource).toContain("getUpdatePostureLabel(plugin.updatePosture, t)")
  })

  test("keeps Codex package handling read-only and avoids fake execution claims", () => {
    expect(pluginsTabSource).toContain("settings.plugins.codexPackageHint")
    expect(pluginsTabSource).toContain("settings.plugins.codexMcpHint")
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
    expect(pluginsTabSource).toContain("getSourceDescriptionLabel(source.runtime, t)")
    expect(pluginsTabSource).toContain("getSourceInstallHintLabel(source.runtime, t)")

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
    expect(pluginsTabSource).not.toContain("identifiers: plugin.components.mcpServers")

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

  test("renders plugin Doctor and Debug facts without sandbox claims", () => {
    expect(pluginsTabSource).toContain("PluginDoctorSummaryPanel")
    expect(pluginsTabSource).toContain("PluginDebugPanel")
    expect(pluginsTabSource).toContain("getWorstDoctorStatus")
    expect(pluginsTabSource).toContain("trpc.plugins.doctor.useQuery")
    expect(pluginsTabSource).toContain("doctorReport?.plugins.find")
    expect(pluginsTabSource).toContain("settings.plugins.doctor")
    expect(pluginsTabSource).toContain("settings.plugins.debug")
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
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }

    expect(dictionarySource).toContain("This is not a sandbox or trust certificate")
    expect(dictionarySource).toContain("不是沙箱或可信证书")
  })
})
