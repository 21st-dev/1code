import { describe, expect, test } from "bun:test"
import type {
  CanonicalChatMessagePart,
  RenderableMessagePart,
} from "../src/shared/chat-message"
import {
  agentUserMessagePartSchema,
  canonicalChatMessagePartSchema,
  canonicalChatMessageSchema,
  renderableMessagePartSchema,
} from "../src/shared/chat-message"

describe("canonical chat message model", () => {
  const textPart = { type: "text", text: "hello" } satisfies CanonicalChatMessagePart
  const toolPart = {
    type: "tool-Read",
    toolCallId: "tool-1",
    state: "output-available",
    input: { file_path: "README.md" },
    output: { content: "docs" },
  } satisfies CanonicalChatMessagePart

  const persistedParts = [
    textPart,
    { type: "reasoning", text: "thinking", state: "done" },
    { type: "step-start" },
    toolPart,
    {
      type: "dynamic-tool",
      toolName: "custom",
      toolCallId: "tool-2",
      state: "input-available",
      input: { value: true },
    },
    {
      type: "source-url",
      sourceId: "source-1",
      url: "https://example.com",
      title: "Example",
    },
    {
      type: "source-document",
      sourceId: "source-2",
      mediaType: "text/plain",
      title: "Document",
      filename: "document.txt",
    },
    {
      type: "file",
      mediaType: "text/plain",
      filename: "notes.txt",
      url: "data:text/plain;base64,aGVsbG8=",
    },
    {
      type: "attachment-image",
      attachmentId: "image-1",
      localRef: "cia:v1:image-1",
      filename: "screenshot.png",
      mediaType: "image/png",
      sizeBytes: 123,
    },
    {
      type: "data-image",
      data: {
        url: "data:image/png;base64,abc",
        mediaType: "image/png",
        filename: "legacy.png",
      },
    },
    {
      type: "data-image",
      data: {
        base64Data: "abc",
        mediaType: "image/png",
        filename: "main-writer-legacy.png",
      },
    },
    {
      type: "data-file",
      data: {
        url: "file:///tmp/report.txt",
        mediaType: "text/plain",
        filename: "report.txt",
        size: 42,
      },
    },
    {
      type: "long-text-attachment",
      attachmentId: "long-1",
      localRef: "lta:v1:long-1",
      filename: "paste.txt",
      byteLength: 4096,
      preview: "large pasted text",
      kind: "pasted",
    },
    {
      type: "file-content",
      filePath: "src/main.ts",
      content: "export {}",
    },
  ] satisfies CanonicalChatMessagePart[]

  const renderableParts = [
    ...persistedParts,
    { type: "exploring-group", parts: [toolPart] },
    { type: "task-group", parts: [toolPart] },
  ] satisfies RenderableMessagePart[]

  test("accepts every persisted part shape in the canonical schema", () => {
    for (const part of persistedParts) {
      expect(canonicalChatMessagePartSchema.safeParse(part).success).toBe(true)
    }
  })

  test("keeps render-derived grouping parts out of persisted schema", () => {
    expect(
      canonicalChatMessagePartSchema.safeParse({
        type: "exploring-group",
        parts: [toolPart],
      }).success,
    ).toBe(false)
    expect(
      canonicalChatMessagePartSchema.safeParse({
        type: "task-group",
        parts: [toolPart],
      }).success,
    ).toBe(false)

    for (const part of renderableParts) {
      expect(renderableMessagePartSchema.safeParse(part).success).toBe(true)
    }
  })

  test("rejects unregistered generic data parts", () => {
    // @ts-expect-error data-foo is not an explicitly registered local part.
    const genericDataPart: CanonicalChatMessagePart = {
      type: "data-foo",
      data: { value: true },
    }

    expect(genericDataPart.type).toBe("data-foo")
    expect(canonicalChatMessagePartSchema.safeParse(genericDataPart).success).toBe(
      false,
    )
  })

  test("user message part schema derives from the canonical local part schema", () => {
    for (const part of [
      textPart,
      persistedParts[8],
      persistedParts[9],
      persistedParts[10],
      persistedParts[11],
      persistedParts[12],
      persistedParts[13],
    ]) {
      expect(agentUserMessagePartSchema.safeParse(part).success).toBe(true)
    }

    expect(agentUserMessagePartSchema.safeParse(toolPart).success).toBe(false)
  })

  test("message schema preserves optional parts and string or Date createdAt", () => {
    expect(
      canonicalChatMessageSchema.safeParse({
        id: "msg-1",
        role: "assistant",
        createdAt: "2026-06-18T00:00:00.000Z",
        parts: [toolPart],
        metadata: {
          sdkMessageUuid: "sdk-1",
          outputTokens: 3,
        },
      }).success,
    ).toBe(true)

    expect(
      canonicalChatMessageSchema.safeParse({
        id: "msg-2",
        role: "user",
        createdAt: new Date("2026-06-18T00:00:00.000Z"),
      }).success,
    ).toBe(true)
  })
})
