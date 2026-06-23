import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

function readSource(path: string): string {
  return readFileSync(path, "utf8")
}

describe("Qwen CLI setup guidance UI source guards", () => {
  const modelsTab = readSource(
    "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
  )
  const newChatForm = readSource(
    "src/renderer/features/agents/main/new-chat-form.tsx",
  )
  const atoms = readSource("src/renderer/lib/atoms/index.ts")
  const manifestStore = readSource(
    "src/renderer/features/agents/lib/runtime-manifest-store.ts",
  )

  test("Models settings exposes passive Qwen CLI setup controls", () => {
    expect(modelsTab).toContain("qwenRuntimeVisible")
    expect(modelsTab).toContain("trpc.agentRuntime.getQwenCliStatus.useQuery")
    expect(modelsTab).toContain(
      "trpc.agentRuntime.updateQwenExecutablePath.useMutation",
    )
    expect(modelsTab).toContain(
      "trpc.agentRuntime.resetQwenExecutablePath.useMutation",
    )
    expect(modelsTab).toContain("settings.models.qwenCli.title")
    expect(modelsTab).toContain("settings.models.qwenCli.overridePath")
    expect(modelsTab).toContain("handleCopyQwenInstallCommand")
    expect(modelsTab).toContain("navigator.clipboard.writeText")
    expect(modelsTab).toContain("qwenCliSectionRef")
    expect(modelsTab).toContain('modelsSettingsTarget === "qwen-cli"')
  })

  test("renderer guidance stays passive and does not own Qwen auth/install writes", () => {
    expect(modelsTab).not.toContain("child_process")
    expect(modelsTab).not.toContain("spawn(")
    expect(modelsTab).not.toContain("exec(")
    expect(modelsTab).not.toContain("writeFile")
    expect(modelsTab).not.toContain("~/.qwen")
    expect(modelsTab).not.toContain("curl | bash")
  })

  test("new chat hides Qwen as runnable until CLI status is ready", () => {
    expect(newChatForm).toContain("trpc.agentRuntime.getQwenCliStatus.useQuery")
    expect(newChatForm).toContain("qwenCliReady")
    expect(newChatForm).toContain("qwenSetupRequired")
    expect(newChatForm).toContain("disabled: !qwenCliReady")
    expect(newChatForm).toContain('setModelsSettingsTarget("qwen-cli")')
    expect(newChatForm).toContain("agent.qwenCli.setupRequired")
    expect(atoms).toContain('"qwen-cli"')
    expect(manifestStore).toContain('runtime === "qwen"')
  })
})
