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
    ]) {
      expect(dictionarySource).toContain(`"${key}"`)
    }
  })
})
