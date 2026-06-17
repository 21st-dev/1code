import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyDesktopRunPreflight } from "../src/main/lib/agent-runtime/preflight"
import { chats, subChats } from "../src/main/lib/db/schema"
import { setElectronUserDataPathProviderForTest } from "../src/main/lib/electron-app"
import {
  prependLongTextAttachmentPromptBlocks,
  stageLongTextAttachment,
} from "../src/main/lib/long-text-attachments"
import { buildAgentMessageParts } from "../src/renderer/features/agents/lib/message-parts"
import { createAgentJobTestDb } from "./helpers/agent-job-test-db"

let userDataDir = ""

describe("quick chat attachment smoke", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-quick-chat-smoke-"))
    setElectronUserDataPathProviderForTest(() => userDataDir)
  })

  afterEach(async () => {
    setElectronUserDataPathProviderForTest(null)
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("folderless quick chat carries uploaded text into a rewrite prompt", async () => {
    const db = createAgentJobTestDb()
    db.insert(chats)
      .values({
        id: "quick-chat-attachment",
        projectId: null,
      })
      .run()
    db.insert(subChats)
      .values({
        id: "quick-sub-chat-attachment",
        chatId: "quick-chat-attachment",
      })
      .run()

    const preflight = verifyDesktopRunPreflight(db, {
      chatId: "quick-chat-attachment",
      subChatId: "quick-sub-chat-attachment",
      cwd: "/tmp/renderer-cwd-ignored",
      folderlessScratchCwd: join(userDataDir, "scratch"),
    })

    expect(preflight.kind).toBe("folderless")
    expect(preflight.project).toBeNull()

    const fullLongText = `ORIGINAL_LONG_TEXT_BODY: make this shorter. ${"detail ".repeat(80)}`
    const longText = await stageLongTextAttachment({
      subChatId: preflight.subChat.id,
      filename: "uploaded-notes.txt",
      text: fullLongText,
      kind: "file",
    })
    const fileContent = "ORIGINAL_SMALL_FILE_BODY: rewrite this sentence."

    const parts = buildAgentMessageParts({
      text: "Rewrite the uploaded material in a clearer tone.",
      pastedTexts: [
        {
          ...longText,
          filePath: longText.localRef,
          size: longText.byteLength,
        },
      ],
      fileContents: [["file:external:/tmp/uploaded-small.txt", fileContent]],
    })

    expect(parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "long-text-attachment",
          localRef: longText.localRef,
          filename: "uploaded-notes.txt",
        }),
        {
          type: "file-content",
          filePath: "/tmp/uploaded-small.txt",
          content: fileContent,
        },
      ]),
    )
    expect(JSON.stringify(parts)).not.toContain(fullLongText)

    const rewritePrompt = await prependLongTextAttachmentPromptBlocks(
      "Rewrite the uploaded material in a clearer tone.",
      [
        {
          attachmentId: longText.id,
          localRef: longText.localRef,
          filename: longText.filename,
          byteLength: longText.byteLength,
          kind: longText.kind,
        },
      ],
    )

    expect(rewritePrompt).toContain(fullLongText)
    expect(rewritePrompt).toContain(
      "Rewrite the uploaded material in a clearer tone.",
    )
  })
})
