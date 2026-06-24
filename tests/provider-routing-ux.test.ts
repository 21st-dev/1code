import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// The chats router is split across `chats*.ts` modules; read them together so
// source guards verify the implementation regardless of internal file layout.
function readChatsRouterSource(): string {
  const dir = join(process.cwd(), "src/main/lib/trpc/routers")
  return readdirSync(dir)
    .filter((file) => /^chats.*\.ts$/.test(file))
    .map((file) => readFileSync(join(dir, file), "utf8"))
    .join("\n")
}

describe("provider routing UX source guards", () => {
  const modelsTabSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/components/dialogs/settings-tabs/agents-models-tab.tsx",
    ),
    "utf8",
  )
  // The provider-profile create/edit form is a shared component reused by both
  // Settings and first-run onboarding.
  const providerEditorSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/features/agents/components/provider-profile-editor.tsx",
    ),
    "utf8",
  )
  const settingsContentSource = readFileSync(
    join(process.cwd(), "src/renderer/features/settings/settings-content.tsx"),
    "utf8",
  )
  const newChatFormSource = readFileSync(
    join(process.cwd(), "src/renderer/features/agents/main/new-chat-form.tsx"),
    "utf8",
  )
  const chatInputAreaSource = readFileSync(
    join(process.cwd(), "src/renderer/features/agents/main/chat-input-area.tsx"),
    "utf8",
  )
  const activeChatSource = readFileSync(
    join(process.cwd(), "src/renderer/features/agents/main/active-chat.tsx"),
    "utf8",
  )
  const kunProviderSelectorSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/features/agents/components/kun-provider-profile-selector.tsx",
    ),
    "utf8",
  )
  const providerGatewaySource = readFileSync(
    join(process.cwd(), "src/main/lib/provider-profiles/gateway.ts"),
    "utf8",
  )
  const agentRuntimeRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/agent-runtime.ts"),
    "utf8",
  )
  const chatsRouterSource = readChatsRouterSource()
  const acpChatTransportSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/features/agents/lib/acp-chat-transport.ts",
    ),
    "utf8",
  )
  const ipcChatTransportSource = readFileSync(
    join(
      process.cwd(),
      "src/renderer/features/agents/lib/ipc-chat-transport.ts",
    ),
    "utf8",
  )
  const codexRouterSource = readFileSync(
    join(process.cwd(), "src/main/lib/trpc/routers/codex.ts"),
    "utf8",
  )
  const codexAppServerAdapterSource = readFileSync(
    join(process.cwd(), "src/main/lib/codex/app-server-adapter.ts"),
    "utf8",
  )

  test("Models settings uses a wide layout for provider routing controls", () => {
    expect(settingsContentSource).toContain('activeTab === "models"')
    expect(settingsContentSource).toContain("max-w-6xl")
    expect(settingsContentSource).toContain("max-w-2xl")
  })

  test("provider presets and target runtimes are accessible chip controls", () => {
    expect(providerEditorSource).toContain("presetHint")
    expect(providerEditorSource).toContain("aria-pressed={selected}")
    expect(providerEditorSource).toContain(
      "aria-pressed={targetRuntimes.includes(target)}",
    )
    expect(providerEditorSource).toContain("getProviderTargetLabel(target, t)")
  })

  test("diagnostics render localized labels instead of raw status ids", () => {
    expect(modelsTabSource).toContain("getDiagnosticCheckLabel(check.id, t)")
    expect(modelsTabSource).toContain(
      "getDiagnosticStatusLabel(check.status, t)",
    )
    expect(modelsTabSource).toContain(
      "settings.models.providerProfiles.statusUntested",
    )
    expect(modelsTabSource).not.toContain("{check.status}")
  })

  test("profile testing and sensitive destination edits are row-specific and explicit", () => {
    expect(modelsTabSource).toContain("testingProfileId")
    expect(modelsTabSource).toContain("isTestingProfile")
    expect(providerEditorSource).toContain("tokenRefreshRequired")
    expect(providerEditorSource).toContain(
      "settings.models.providerProfiles.tokenRefreshRequired",
    )
  })

  test("Models settings uses Provider Profiles instead of the legacy override editor", () => {
    expect(modelsTabSource).toContain("ProviderProfilesSettingsSection")
    expect(modelsTabSource).toContain("ConfirmActionDialog")
    expect(modelsTabSource).toContain("SelectTrigger")
    expect(modelsTabSource).toContain(
      "settings.models.removeCodexApiKeyConfirm",
    )
    expect(modelsTabSource).toContain("settings.models.resetProviderConfirm")
    expect(modelsTabSource).toContain("common.codexApiKey")
    expect(modelsTabSource).not.toContain("isApiKeysOpen")
    expect(modelsTabSource).not.toContain("settings.models.apiKeys")
    expect(modelsTabSource).not.toContain("claudeProviderConfig")
    expect(modelsTabSource).not.toContain("settings.models.overrideModel")
    expect(modelsTabSource).not.toContain("window.confirm")
    expect(modelsTabSource).not.toContain("<select")
  })

  test("Models connected states use explicit success status styling", () => {
    expect(modelsTabSource).toContain("function ActiveStatusBadge")
    expect(modelsTabSource).toContain("border-emerald-500/25")
    expect(modelsTabSource).toContain("<ActiveStatusBadge>")
    expect(modelsTabSource).not.toContain(
      '<Badge variant="secondary" className="text-xs">',
    )
  })

  test("Provider Profile headers use key/value rows instead of raw JSON input", () => {
    expect(providerEditorSource).toContain("providerHeaderRowsFromMetadata")
    expect(providerEditorSource).toContain("providerHeadersFromRows")
    expect(providerEditorSource).toContain("headerRows.map")
    expect(providerEditorSource).toContain(
      "settings.models.providerProfiles.addHeader",
    )
    expect(providerEditorSource).toContain(
      "settings.models.providerProfiles.savedHeaderValue",
    )
    expect(providerEditorSource).not.toContain("headersText")
    expect(providerEditorSource).not.toContain("JSON.parse(headers")
    expect(providerEditorSource).not.toContain('{"HTTP-Referer"')
  })

  test("new chats persist selected provider metadata for transport routing", () => {
    expect(newChatFormSource).toContain(
      "provider: selectedRuntimeProvider",
    )
    expect(newChatFormSource).toContain(
      'selectedRuntimeProvider === "qwen-code"',
    )
    expect(newChatFormSource).toContain('selectedRuntimeProvider === "kun"')
    expect(newChatFormSource).toContain('"runtime-managed"')
    expect(newChatFormSource).toContain("modelSource:")
    expect(newChatFormSource).toContain("providerProfileId:")
    expect(chatsRouterSource).toContain("buildAgentChatMessageMetadata")
    expect(chatsRouterSource).toContain("provider: input.provider")
    expect(acpChatTransportSource).toContain("normalizeAgentChatMetadataModel")
    expect(acpChatTransportSource).toContain("formatProviderProfileCodexModel")
    expect(acpChatTransportSource).toContain(
      "providerProfileId && metadataModel",
    )
    expect(codexRouterSource).toContain("model: metadataModel")
    expect(codexAppServerAdapterSource).toContain("providerBinding.model")
    expect(newChatFormSource).toContain("normalizeClaudeModelSourceForRun")
    expect(ipcChatTransportSource).toContain("normalizeClaudeModelSourceForRun")
  })

  test("Kun provider profiles use a dedicated target through UI and runtime routing", () => {
    expect(providerEditorSource).toContain(
      'kun: "settings.models.providerProfiles.targetKun"',
    )
    expect(kunProviderSelectorSource).toContain(
      'profile.targetRuntimes.includes("kun")',
    )
    expect(newChatFormSource).toContain("lastSelectedKunModelSourceAtom")
    expect(newChatFormSource).toContain(
      'selectedRuntimeProvider === "kun"',
    )
    expect(chatInputAreaSource).toContain("subChatKunModelSourceAtomFamily")
    expect(activeChatSource).toContain("subChatKunModelSourceAtomFamily")
    expect(activeChatSource).toContain("parseProviderProfileSource(kunModelSource)")
    expect(providerGatewaySource).toContain('target === "kun"')
    expect(agentRuntimeRouterSource).toContain("synthesizeKunProviderConfig")
    expect(agentRuntimeRouterSource).toContain("kunProviderConfig?.cleanup()")
    expect(kunProviderSelectorSource).not.toContain(
      'targetRuntimes.includes("local")',
    )
  })
})
