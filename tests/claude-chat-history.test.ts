import { describe, expect, test } from "bun:test"
import {
  buildClaudeUserParts,
  claudeImageAttachmentSignatureFromInput,
  claudeImageAttachmentSignatureFromParts,
  claudeLongTextAttachmentSignatureFromInput,
  claudeLongTextAttachmentSignatureFromParts,
  consumeClaudeChatForkResumeFlags,
  isDuplicateClaudeUserMessage,
  prepareClaudeUserMessageForHistory,
  resolveClaudeChatResumeMetadata,
} from "../src/main/lib/claude/chat-history"

describe("Claude chat history helpers", () => {
  test("resolves rollback and fork resume metadata from the latest assistant message", () => {
    expect(
      resolveClaudeChatResumeMetadata([
        {
          role: "assistant",
          metadata: {
            shouldResume: true,
            sdkMessageUuid: "older-uuid",
          },
        },
        { role: "user", parts: [{ type: "text", text: "next" }] },
        {
          role: "assistant",
          metadata: {
            shouldForkResume: true,
            sdkMessageUuid: "latest-uuid",
          },
        },
      ]),
    ).toEqual({
      resumeAtUuid: null,
      shouldForkResume: true,
      forkResumeAtUuid: "latest-uuid",
    })

    expect(
      resolveClaudeChatResumeMetadata([
        {
          role: "assistant",
          metadata: {
            shouldResume: true,
            sdkMessageUuid: "rollback-uuid",
          },
        },
      ]),
    ).toEqual({
      resumeAtUuid: "rollback-uuid",
      shouldForkResume: false,
      forkResumeAtUuid: null,
    })

    expect(resolveClaudeChatResumeMetadata([{ role: "user" }])).toEqual({
      resumeAtUuid: null,
      shouldForkResume: false,
      forkResumeAtUuid: null,
    })
  })

  test("consumes one-shot fork resume flags without mutating original messages", () => {
    const messages = [
      {
        role: "assistant",
        metadata: {
          shouldForkResume: true,
          sdkMessageUuid: "assistant-1",
        },
      },
      {
        role: "assistant",
        metadata: {
          sdkMessageUuid: "assistant-2",
        },
      },
    ]

    const result = consumeClaudeChatForkResumeFlags(messages)

    expect(result.changed).toBe(true)
    expect(result.messages).toEqual([
      {
        role: "assistant",
        metadata: {
          sdkMessageUuid: "assistant-1",
        },
      },
      {
        role: "assistant",
        metadata: {
          sdkMessageUuid: "assistant-2",
        },
      },
    ])
    expect(messages[0].metadata.shouldForkResume).toBe(true)
  })

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

  test("detects duplicate user messages across text and long-text attachments", () => {
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
    const images: any[] = []
    const messages = [
      {
        role: "user",
        parts: buildClaudeUserParts("hello", images, longTextAttachments),
      },
    ]

    expect(
      isDuplicateClaudeUserMessage({
        messages,
        prompt: "hello",
        images,
        longTextAttachments,
      }),
    ).toBe(true)

    expect(
      isDuplicateClaudeUserMessage({
        messages,
        prompt: "hello",
        images: [
          {
            attachmentId: "image-1",
            localRef: "local-image",
            mediaType: "image/png",
            filename: "screen.png",
            sizeBytes: 100,
          },
        ],
        longTextAttachments,
      }),
    ).toBe(false)
    expect(
      isDuplicateClaudeUserMessage({
        messages: [{ role: "assistant", parts: messages[0].parts }],
        prompt: "hello",
        images,
        longTextAttachments,
      }),
    ).toBe(false)
  })

  test("prepares user history message by reusing duplicates or appending a new message", () => {
    const existingUserMessage = {
      role: "user",
      parts: buildClaudeUserParts("hello", [], []),
    }
    const duplicate = prepareClaudeUserMessageForHistory({
      messages: [existingUserMessage],
      prompt: "hello",
      images: [],
      longTextAttachments: [],
      createId: () => "new-id",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(duplicate).toEqual({
      isDuplicate: true,
      userMessage: existingUserMessage,
      messagesToSave: [existingUserMessage],
    })

    const created = prepareClaudeUserMessageForHistory({
      messages: [],
      prompt: "hello",
      images: [],
      longTextAttachments: [],
      createId: () => "message-1",
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    })

    expect(created).toEqual({
      isDuplicate: false,
      userMessage: {
        id: "message-1",
        role: "user",
        createdAt: "2026-01-01T00:00:00.000Z",
        parts: [{ type: "text", text: "hello" }],
      },
      messagesToSave: [
        {
          id: "message-1",
          role: "user",
          createdAt: "2026-01-01T00:00:00.000Z",
          parts: [{ type: "text", text: "hello" }],
        },
      ],
    })
  })
})
