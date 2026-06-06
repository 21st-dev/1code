import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import {
  buildClaudeUserParts,
  claudeImageAttachmentSignatureFromInput,
  claudeImageAttachmentSignatureFromParts,
  claudeLongTextAttachmentSignatureFromInput,
  claudeLongTextAttachmentSignatureFromParts,
  consumeClaudeChatForkResumeFlags,
  isDuplicateClaudeUserMessage,
  prepareClaudeChatHistoryForDesktopRun,
  prepareClaudeUserMessageForHistory,
  resolveClaudeChatResumeMetadata,
} from "../src/main/lib/claude/chat-history"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

function seedChatHistory(
  db: ReturnType<typeof createAgentJobTestDb>,
  messages: Array<Record<string, any>>,
) {
  db.insert(projects)
    .values({
      id: "project-1",
      name: "Project",
      path: "/repo",
    })
    .run()
  db.insert(chats)
    .values({
      id: "chat-1",
      projectId: "project-1",
      worktreePath: "/repo",
      updatedAt: new Date("2026-05-31T00:00:00.000Z"),
    })
    .run()
  db.insert(subChats)
    .values({
      id: "sub-1",
      chatId: "chat-1",
      sessionId: "session-old",
      streamId: null,
      messages: JSON.stringify(messages),
      updatedAt: new Date("2026-05-31T00:00:00.000Z"),
    })
    .run()
}

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

  test("prepares desktop run history, consumes fork flags, and saves the user message", () => {
    const db = createAgentJobTestDb()
    seedChatHistory(db, [
      {
        role: "assistant",
        metadata: {
          shouldForkResume: true,
          sdkMessageUuid: "assistant-1",
        },
      },
    ])

    const result = prepareClaudeChatHistoryForDesktopRun({
      db,
      subChatId: "sub-1",
      streamId: "stream-1",
      prompt: "next",
      images: [],
      longTextAttachments: [],
      createId: () => "user-1",
      now: () => new Date("2026-06-01T00:00:00.000Z"),
    })

    expect(result).toMatchObject({
      existingSessionId: "session-old",
      existingMessages: [
        {
          role: "assistant",
          metadata: {
            sdkMessageUuid: "assistant-1",
          },
        },
      ],
      resumeAtUuid: null,
      shouldForkResume: true,
      forkResumeAtUuid: "assistant-1",
      isDuplicate: false,
    })
    expect(result.messagesToSave).toEqual([
      {
        role: "assistant",
        metadata: {
          sdkMessageUuid: "assistant-1",
        },
      },
      {
        id: "user-1",
        role: "user",
        createdAt: "2026-06-01T00:00:00.000Z",
        parts: [{ type: "text", text: "next" }],
      },
    ])

    const saved = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(saved?.streamId).toBe("stream-1")
    expect(JSON.parse(saved?.messages ?? "[]")).toEqual(result.messagesToSave)
  })

  test("prepares desktop run history without rewriting duplicate user messages", () => {
    const db = createAgentJobTestDb()
    const duplicateMessage = {
      id: "user-existing",
      role: "user",
      parts: buildClaudeUserParts("same", [], []),
    }
    seedChatHistory(db, [duplicateMessage])

    const result = prepareClaudeChatHistoryForDesktopRun({
      db,
      subChatId: "sub-1",
      streamId: "stream-duplicate",
      prompt: "same",
      images: [],
      longTextAttachments: [],
      createId: () => "user-new",
    })

    expect(result).toMatchObject({
      existingSessionId: "session-old",
      existingMessages: [duplicateMessage],
      isDuplicate: true,
      userMessage: duplicateMessage,
      messagesToSave: [duplicateMessage],
    })

    const saved = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(saved?.streamId).toBeNull()
    expect(JSON.parse(saved?.messages ?? "[]")).toEqual([duplicateMessage])
  })
})
