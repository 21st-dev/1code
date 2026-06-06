import { describe, expect, test } from "bun:test"
import {
  buildCodexUserParts,
  codexImageAttachmentSignatureFromInput,
  codexImageAttachmentSignatureFromParts,
  codexLongTextAttachmentSignatureFromInput,
  codexLongTextAttachmentSignatureFromParts,
  extractCodexPromptFromStoredMessage,
  getLastCodexSessionId,
  parseCodexStoredMessages,
} from "../src/main/lib/codex/chat-history"

describe("Codex chat history helpers", () => {
  test("parses stored messages defensively and extracts prompt content", () => {
    expect(parseCodexStoredMessages(null)).toEqual([])
    expect(parseCodexStoredMessages("{not-json")).toEqual([])
    expect(parseCodexStoredMessages(JSON.stringify({ role: "user" }))).toEqual([])

    const messages = [
      {
        role: "user",
        parts: [
          { type: "text", text: "hello" },
          {
            type: "file-content",
            filePath: "/repo/src/file.ts",
            content: "export {}",
          },
        ],
      },
      {
        role: "assistant",
        metadata: { sessionId: "session-1" },
      },
    ]

    expect(parseCodexStoredMessages(JSON.stringify(messages))).toEqual(messages)
    expect(extractCodexPromptFromStoredMessage(messages[0])).toBe(
      "hello\n--- file.ts ---\nexport {}",
    )
    expect(getLastCodexSessionId(messages)).toBe("session-1")
  })

  test("builds user parts and stable duplicate-detection signatures", () => {
    const longTextAttachments = [
      {
        attachmentId: "text-1",
        localRef: "local-text",
        filename: "notes.txt",
        byteLength: 50,
        preview: "preview",
        kind: "paste" as const,
      },
    ]
    const imageAttachments = [
      {
        attachmentId: "image-1",
        localRef: "local-image",
        mediaType: "image/png",
        filename: "screen.png",
        sizeBytes: 100,
        width: 10,
        height: 20,
        sha256: "abc",
      },
      {
        base64Data: "legacy-data",
        mediaType: "image/jpeg",
        filename: "legacy.jpg",
      },
    ]

    const parts = buildCodexUserParts(
      "hello",
      imageAttachments,
      longTextAttachments,
    )

    expect(parts).toEqual([
      { type: "text", text: "hello" },
      {
        type: "attachment-image",
        attachmentId: "image-1",
        localRef: "local-image",
        filename: "screen.png",
        mediaType: "image/png",
        sizeBytes: 100,
        width: 10,
        height: 20,
        sha256: "abc",
      },
      {
        type: "data-image",
        data: {
          base64Data: "legacy-data",
          mediaType: "image/jpeg",
          filename: "legacy.jpg",
        },
      },
      {
        type: "long-text-attachment",
        attachmentId: "text-1",
        localRef: "local-text",
        filename: "notes.txt",
        byteLength: 50,
        preview: "preview",
        kind: "paste",
      },
    ])
    expect(codexLongTextAttachmentSignatureFromParts(parts)).toBe(
      codexLongTextAttachmentSignatureFromInput(longTextAttachments),
    )
    expect(codexImageAttachmentSignatureFromParts(parts)).toBe(
      JSON.stringify([
        {
          localRef: "local-image",
          sizeBytes: 100,
          mediaType: "image/png",
        },
        {
          legacy: true,
          filename: "legacy.jpg",
          mediaType: "image/jpeg",
          base64Length: 11,
        },
      ]),
    )
    expect(codexImageAttachmentSignatureFromInput(imageAttachments)).toBe(
      JSON.stringify([
        {
          localRef: "local-image",
          sizeBytes: 100,
          mediaType: "image/png",
          base64Length: 0,
        },
        {
          mediaType: "image/jpeg",
          legacy: true,
          base64Length: 11,
        },
      ]),
    )
  })
})
