import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import {
  prepareClaudeAgentSdkDesktopRunInputs,
} from "../src/main/lib/claude/agent-sdk-desktop-run-inputs"
import { chats, projects, subChats } from "../src/main/lib/db/schema"
import { getChatImageAttachmentCapability } from "../src/shared/chat-attachment-capabilities"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

const supportedImageCapability = getChatImageAttachmentCapability({
  provider: "claude-code",
  modelVision: "supported",
})

function seedChat(
  db: ReturnType<typeof createAgentJobTestDb>,
  messages: Array<Record<string, any>> = [],
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
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    .run()
  db.insert(subChats)
    .values({
      id: "sub-1",
      chatId: "chat-1",
      sessionId: "session-old",
      streamId: null,
      messages: JSON.stringify(messages),
      updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    })
    .run()
}

describe("Claude Agent SDK desktop run input preparation", () => {
  test("resolves image attachments and prepares chat history together", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)

    const result = await prepareClaudeAgentSdkDesktopRunInputs({
      db,
      subChatId: "sub-1",
      streamId: "stream-1",
      prompt: "hello",
      images: [
        {
          attachmentId: "image-1",
          base64Data: Buffer.from("inline-image").toString("base64"),
          mediaType: "image/png",
          filename: "inline.png",
        },
      ],
      imageCapability: supportedImageCapability,
      longTextAttachments: [],
      historyEnabled: true,
      createId: () => "user-1",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.historyEnabled).toBe(true)
    expect(result.resolvedImages).toMatchObject([
      {
        attachmentId: "image-1",
        base64Data: Buffer.from("inline-image").toString("base64"),
        filename: "inline.png",
        mediaType: "image/png",
        sizeBytes: 12,
      },
    ])
    expect(result.chatHistory).toMatchObject({
      existingSessionId: "session-old",
      isDuplicate: false,
      userMessage: {
        id: "user-1",
        role: "user",
        parts: [
          { type: "text", text: "hello" },
          {
            type: "data-image",
            data: {
              base64Data: Buffer.from("inline-image").toString("base64"),
              mediaType: "image/png",
              filename: "inline.png",
            },
          },
        ],
      },
    })
  })

  test("blocks invalid image attachments before chat history writes", async () => {
    const db = createAgentJobTestDb()
    seedChat(db)
    const blockers: any[] = []

    const result = await prepareClaudeAgentSdkDesktopRunInputs({
      db,
      subChatId: "sub-1",
      streamId: "stream-blocked",
      prompt: "hello",
      images: [
        {
          localRef: "not-a-chat-image-ref",
          mediaType: "image/png",
        },
      ],
      imageCapability: supportedImageCapability,
      longTextAttachments: [],
      historyEnabled: true,
      emitPreflightBlocker: (blocker) => blockers.push(blocker),
      createId: () => {
        throw new Error("history should not be prepared")
      },
    })

    expect(result).toMatchObject({
      ok: false,
      reason: "image-attachment-blocked",
      blocker: {
        id: "attachment",
        status: "blocked",
      },
    })
    expect(blockers).toEqual([
      expect.objectContaining({
        id: "attachment",
        status: "blocked",
      }),
    ])
    const saved = db
      .select()
      .from(subChats)
      .where(eq(subChats.id, "sub-1"))
      .get()
    expect(saved?.streamId).toBeNull()
    expect(JSON.parse(saved?.messages ?? "[]")).toEqual([])
  })
})
