import { describe, expect, test } from "bun:test"
import {
  collectExperimentalRuntimeAssistantChunk,
  createExperimentalRuntimeAssistantAccumulator,
  prepareExperimentalRuntimeAssistantMessages,
  prepareExperimentalRuntimeUserMessages,
} from "../src/main/lib/agent-runtime/experimental-runtime-message-history"

describe("experimental runtime message history", () => {
  test("appends runtime user messages and avoids duplicate prompt persistence", () => {
    const now = () => new Date("2026-01-01T00:00:00.000Z")
    const messages = prepareExperimentalRuntimeUserMessages({
      existingMessages: [],
      prompt: "hello",
      metadata: { runtimeId: "kun", modelSource: "runtime-managed" },
      now,
      createId: () => "user-1",
    })

    expect(messages).toEqual([
      {
        id: "user-1",
        role: "user",
        createdAt: "2026-01-01T00:00:00.000Z",
        parts: [{ type: "text", text: "hello" }],
        metadata: {
          model: "kun",
          provider: "kun",
          modelSource: "runtime-managed",
        },
      },
    ])
    expect(
      prepareExperimentalRuntimeUserMessages({
        existingMessages: messages,
        prompt: "hello",
        metadata: { runtimeId: "kun", modelSource: "runtime-managed" },
        now,
        createId: () => "user-2",
      }),
    ).toBe(messages)
  })

  test("builds assistant messages from runtime reasoning and text chunks", () => {
    const accumulator = createExperimentalRuntimeAssistantAccumulator()
    collectExperimentalRuntimeAssistantChunk(accumulator, {
      type: "reasoning-delta",
      id: "reasoning-1",
      delta: "think",
    })
    collectExperimentalRuntimeAssistantChunk(accumulator, {
      type: "text-delta",
      id: "text-1",
      delta: "done",
    })

    expect(
      prepareExperimentalRuntimeAssistantMessages({
        messagesToSave: [],
        accumulator,
        metadata: { runtimeId: "kun" },
        now: () => new Date("2026-01-01T00:00:01.000Z"),
        createId: () => "assistant-1",
      }),
    ).toEqual([
      {
        id: "assistant-1",
        role: "assistant",
        createdAt: "2026-01-01T00:00:01.000Z",
        parts: [
          {
            type: "reasoning",
            id: "reasoning-1",
            text: "think",
            state: "done",
          },
          {
            type: "text",
            id: "text-1",
            text: "done",
            state: "done",
          },
        ],
        metadata: { model: "kun", provider: "kun" },
      },
    ])
  })
})
