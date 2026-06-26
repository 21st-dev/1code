import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("quick chat new chat form", () => {
  test("gates folderless provider choices through runtime capability truth", () => {
    const form = readFileSync(
      "src/renderer/features/agents/main/new-chat-form.tsx",
      "utf8",
    )
    const selector = readFileSync(
      "src/renderer/features/agents/components/agent-engine-selector.tsx",
      "utf8",
    )
    const runtimeModelSelector = readFileSync(
      "src/renderer/features/agents/components/runtime-model-selector.tsx",
      "utf8",
    )

    expect(form).toContain("useRuntimeCapabilityManifestStore")
    expect(form).toContain('capability.id === "quickChatAssistant"')
    expect(form).toContain('capability.status === "supported"')
    expect(form).toContain("qwenRuntimeVisible")
    expect(form).toContain("kunRuntimeVisible")
    expect(form).toContain('manifest.runtimeId === "qwen-code"')
    expect(form).toContain('manifest.runtimeId === "kun"')
    expect(form).toContain("qwenCliReady")
    expect(form).toContain("kunCliReady")
    expect(form).toContain("disabled: !qwenCliReady")
    expect(form).toContain("disabled: !kunCliReady")
    expect(form).toContain("const engineOptions = useMemo<AgentEngineOption[]>")
    expect(form).toContain("isAgentOptionDisabled(agent)")
    expect(form).toContain("<AgentEngineSelector")
    expect(form).toContain("<RuntimeModelSelector")
    expect(form).toContain('toast.error(t("quickChat.providerUnavailable"))')
    expect(form).toContain("quickChatRuntimeGateLoaded")
    expect(form).toContain("selectedAgentIsRuntimeAllowed")

    expect(selector).toContain('option.status === "setup-required"')
    expect(selector).toContain("onSetupEngine?.(option.id)")
    expect(selector).toContain("onSelectEngine(option.id)")
    expect(runtimeModelSelector).toContain('selectedEngineId === "qwen-code"')
    expect(runtimeModelSelector).toContain(
      'profile.targetRuntimes.includes("kun")',
    )
  })

  test("drives new-chat project state from explicit target instead of selected project", () => {
    const atoms = readFileSync(
      "src/renderer/features/agents/atoms/index.ts",
      "utf8",
    )
    const form = readFileSync(
      "src/renderer/features/agents/main/new-chat-form.tsx",
      "utf8",
    )
    const projectSelector = readFileSync(
      "src/renderer/features/agents/components/project-selector.tsx",
      "utf8",
    )

    expect(atoms).toContain("export type NewChatTarget")
    expect(atoms).toContain('atom<NewChatTarget>({ type: "quick" })')

    expect(form).toContain(
      "const [newChatTarget, setNewChatTarget] = useAtom(newChatTargetAtom)",
    )
    expect(form).toContain('if (newChatTarget.type !== "project") return null')
    expect(form).toContain(
      "projectsList.find((p) => p.id === newChatTarget.projectId)",
    )
    expect(form).toContain("const projectForChat = validatedProject")
    expect(form).toContain("const isFolderlessQuickChat = !validatedProject")
    expect(form).toContain('setNewChatTarget({ type: "quick" })')

    expect(projectSelector).toContain("newChatTargetAtom")
    expect(projectSelector).toContain(
      'if (newChatTarget.type !== "project") return null',
    )
    expect(projectSelector).toContain(
      'setNewChatTarget({ type: "project", projectId: project.id })',
    )
  })

  test("keeps project onboarding deferred while preserving upload-to-prompt paths", () => {
    const form = readFileSync(
      "src/renderer/features/agents/main/new-chat-form.tsx",
      "utf8",
    )
    const draftBlock = form.slice(
      form.indexOf("const handleContentChange"),
      form.indexOf("// Clear current draft when chat is created"),
    )

    expect(form).toContain("projectId: projectForChat?.id ?? null")
    expect(form).toContain(
      'useWorktree: Boolean(projectForChat && workMode === "worktree")',
    )
    expect(draftBlock).toMatch(
      /if \(\s*\(text\.trim\(\) \|\|[\s\S]*?validatedProject\s*\)\s*\{/,
    )
    expect(draftBlock).toContain("generateDraftId()")
    expect(draftBlock).toContain("saveGlobalDrafts(globalDrafts)")

    expect(form).toContain("trpcUtils.files.readFile.fetch({")
    expect(form).toContain("projectPath: validatedProject.path")
    expect(form).toContain("fileContents: fileContentsRef.current.entries()")
  })
})
