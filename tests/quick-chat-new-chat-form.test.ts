import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

describe("quick chat new chat form", () => {
  test("gates folderless provider choices through runtime capability truth", () => {
    const form = readFileSync(
      "src/renderer/features/agents/main/new-chat-form.tsx",
      "utf8",
    )
    const selector = readFileSync(
      "src/renderer/features/agents/components/agent-model-selector.tsx",
      "utf8",
    )

    expect(form).toContain("useRuntimeCapabilityManifestStore")
    expect(form).toContain('capability.id === "quickChatAssistant"')
    expect(form).toContain('capability.status === "supported"')
    expect(form).toContain("allowedProviderIds={quickChatAllowedProviderIds}")
    expect(form).toContain('toast.error(t("quickChat.providerUnavailable"))')
    expect(form).toContain("quickChatRuntimeGateLoaded")
    expect(form).toContain("selectedAgentIsRuntimeAllowed")

    expect(selector).toContain("allowedProviderIds?: AgentProviderId[]")
    expect(selector).toContain("providerIsAllowed")
    expect(selector).toContain("getProviderProfileProvider")
    expect(selector).toContain('providerIsAllowed("claude-code")')
    expect(selector).toContain('providerIsAllowed("codex")')
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

    expect(form).toContain("trpcUtils.files.readFile.fetch({ filePath })")
    expect(form).toContain("fileContents: fileContentsRef.current.entries()")
  })
})
