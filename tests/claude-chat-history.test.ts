import { describe, expect, test } from "bun:test"
import {
  buildClaudeUserParts,
  claudeImageAttachmentSignatureFromInput,
  claudeImageAttachmentSignatureFromParts,
  claudeLongTextAttachmentSignatureFromInput,
  claudeLongTextAttachmentSignatureFromParts,
} from "../src/main/lib/claude/chat-history"

describe("Claude chat history helpers", () => {
  test("builds user parts and stable duplicate-detection signatures", () => {
    const longTextAttachments = [
      {
        attachmentId: "text-1",
        localRef: "local-text",
        filename: "notes.txt",
        byteLength: 50,
        preview: "preview",
        kind: "pasted" as const,
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

    const parts = buildClaudeUserParts(
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
        kind: "pasted",
      },
    ])
    expect(claudeLongTextAttachmentSignatureFromParts(parts)).toBe(
      claudeLongTextAttachmentSignatureFromInput(longTextAttachments),
    )
    expect(claudeImageAttachmentSignatureFromParts(parts)).toBe(
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
    expect(claudeImageAttachmentSignatureFromInput(imageAttachments)).toBe(
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
