import { describe, expect, test } from "bun:test"
import {
  buildEmptySubChatValues,
  buildInitialSubChatValues,
  resolveChatRuntimeSelection,
} from "./chat-runtime-selection"

describe("chat runtime selection persistence", () => {
  test("defaults new chat sessions to Hermes instead of Claude", () => {
    expect(resolveChatRuntimeSelection({})).toEqual({
      engine: "hermes",
      modelId: undefined,
    })
  })

  test("preserves selected Hermes engine and model for initial sub-chat creation", () => {
    expect(
      buildInitialSubChatValues({
        chatId: "chat-1",
        engine: "hermes",
        model: "gpt-5.5",
        mode: "agent",
        messages: "[]",
      }),
    ).toMatchObject({
      chatId: "chat-1",
      engine: "hermes",
      modelId: "gpt-5.5",
      mode: "agent",
      messages: "[]",
    })
  })

  test("preserves selected provider for follow-up sub-chat creation", () => {
    expect(
      buildEmptySubChatValues({
        chatId: "chat-1",
        name: "Continue with Codex",
        engine: "codex",
        model: "gpt-5.5/high",
        mode: "plan",
      }),
    ).toEqual({
      chatId: "chat-1",
      name: "Continue with Codex",
      engine: "codex",
      modelId: "gpt-5.5/high",
      mode: "plan",
      messages: "[]",
    })
  })
})
