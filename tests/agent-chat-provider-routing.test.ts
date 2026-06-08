import { describe, expect, test } from "bun:test"
import {
  buildAgentChatMessageMetadata,
  inferAgentChatProviderFromMessages,
  normalizeAgentChatMetadataModel,
} from "../src/shared/agent-chat-provider"
import { providerProfileSource } from "../src/shared/provider-profile-types"

describe("agent chat provider routing metadata", () => {
  test("persists explicit Codex provider metadata for provider-profile models", () => {
    const metadata = buildAgentChatMessageMetadata({
      model: "deepseek-v4-flash",
      provider: "codex",
      modelSource: providerProfileSource("profile-deepseek"),
      providerProfileId: "profile-deepseek",
    })

    expect(metadata).toEqual({
      model: "deepseek-v4-flash",
      provider: "codex",
      modelSource: "provider-profile:profile-deepseek",
      providerProfileId: "profile-deepseek",
    })
    expect(inferAgentChatProviderFromMessages([{ metadata }])).toBe("codex")
  })

  test("keeps legacy model-name inference as a fallback only", () => {
    expect(
      inferAgentChatProviderFromMessages([
        { metadata: { model: "gpt-5.5" } },
      ]),
    ).toBe("codex")
    expect(
      inferAgentChatProviderFromMessages([
        { metadata: { model: "deepseek-v4-flash" } },
      ]),
    ).toBe("claude-code")
  })

  test("explicit provider metadata wins over model-name inference", () => {
    expect(
      inferAgentChatProviderFromMessages([
        { metadata: { model: "gpt-5.5", provider: "claude-code" } },
      ]),
    ).toBe("claude-code")
  })

  test("normalizes persisted metadata model names for transport requests", () => {
    expect(normalizeAgentChatMetadataModel(" deepseek-v4-flash ")).toBe(
      "deepseek-v4-flash",
    )
    expect(normalizeAgentChatMetadataModel("")).toBeNull()
    expect(normalizeAgentChatMetadataModel(null)).toBeNull()
  })
})
