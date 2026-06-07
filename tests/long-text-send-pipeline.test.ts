import { afterEach, describe, expect, mock, test } from "bun:test"
import { readFileSync } from "node:fs"
import { buildAgentMessageParts } from "../src/renderer/features/agents/lib/message-parts"
import {
  createQueueItem,
  toQueuedPastedText,
} from "../src/renderer/features/agents/lib/queue-utils"
import {
  fromDraftPastedText,
  toDraftPastedText,
} from "../src/renderer/features/agents/lib/drafts"
import {
  handlePasteEvent,
  LARGE_PASTE_THRESHOLD,
} from "../src/renderer/features/agents/utils/paste-text"
import type { PastedTextFile } from "../src/renderer/features/agents/hooks/use-pasted-text-files"

const originalDocument = globalThis.document

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  })
})

function samplePastedText(fullBody: string): PastedTextFile {
  return {
    id: "attachment_1",
    filename: "pasted_123.txt",
    byteLength: Buffer.byteLength(fullBody, "utf8"),
    preview: "preview only",
    localRef: "lta:v1:sub_chat_1/attachment_1",
    filePath: "lta:v1:sub_chat_1/attachment_1",
    size: Buffer.byteLength(fullBody, "utf8"),
    kind: "pasted",
    createdAt: new Date("2026-05-25T00:00:00.000Z"),
  }
}

describe("long text send pipeline", () => {
  test("large paste is diverted to the attachment callback without entering the editor", () => {
    const fullBody = "large paste body ".repeat(
      Math.ceil((LARGE_PASTE_THRESHOLD + 1) / "large paste body ".length),
    )
    const preventDefault = mock(() => undefined)
    const addPastedText = mock(async (_text: string) => undefined)
    const execCommand = mock(() => true)

    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { execCommand },
    })

    handlePasteEvent(
      {
        clipboardData: {
          items: [],
          getData: (type: string) => (type === "text/plain" ? fullBody : ""),
        },
        currentTarget: {
          closest: () => ({ textContent: "" }),
        },
        preventDefault,
      } as any,
      () => undefined,
      addPastedText,
    )

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(addPastedText).toHaveBeenCalledWith(fullBody)
    expect(execCommand).not.toHaveBeenCalled()
  })

  test("message parts persist metadata only and never serialize the long text body", () => {
    const fullBody = "UNIQUE_FULL_LONG_TEXT_BODY_".repeat(260)
    const pastedText = samplePastedText(fullBody)

    const parts = buildAgentMessageParts({
      text: "summarize this",
      pastedTexts: [pastedText],
    })
    const serialized = JSON.stringify(parts)

    expect(parts[0]).toMatchObject({
      type: "long-text-attachment",
      attachmentId: pastedText.id,
      localRef: pastedText.localRef,
      filename: pastedText.filename,
      byteLength: pastedText.byteLength,
      kind: "pasted",
    })
    expect(parts.some((part) => part.type === "text")).toBe(true)
    expect(serialized).not.toContain(fullBody)
    expect(serialized).not.toContain("@[pasted:")
  })

  test("draft, restart restore, and queue paths keep resolvable metadata without long text bodies", () => {
    const fullBody = "QUEUE_AND_DRAFT_LONG_TEXT_BODY_".repeat(260)
    const pastedText = samplePastedText(fullBody)

    const draft = toDraftPastedText(pastedText)
    const persistedDraftJson = JSON.stringify(draft)
    const restored = fromDraftPastedText(JSON.parse(persistedDraftJson))
    const queued = toQueuedPastedText(pastedText)
    const item = createQueueItem(
      "queue_1",
      "",
      undefined,
      undefined,
      undefined,
      undefined,
      [queued],
    )
    const queuedParts = buildAgentMessageParts({
      pastedTexts: item.pastedTexts,
    })

    expect(persistedDraftJson).not.toContain(fullBody)
    expect(restored).toMatchObject({
      localRef: pastedText.localRef,
      byteLength: pastedText.byteLength,
      kind: "pasted",
    })
    expect(queuedParts).toEqual([
      expect.objectContaining({
        type: "long-text-attachment",
        localRef: pastedText.localRef,
        byteLength: pastedText.byteLength,
      }),
    ])
    expect(JSON.stringify(item)).not.toContain(fullBody)
  })

  test("removed pasted text state produces no long text attachment part", () => {
    const fullBody = "REMOVED_LONG_TEXT_BODY_".repeat(260)
    const parts = buildAgentMessageParts({
      text: "send without removed attachment",
      pastedTexts: [],
    })
    const serialized = JSON.stringify(parts)

    expect(parts).toEqual([
      { type: "text", text: "send without removed attachment" },
    ])
    expect(serialized).not.toContain("long-text-attachment")
    expect(serialized).not.toContain(fullBody)
  })

  test("Claude, Codex, and auth retry paths are wired to resolved long text metadata", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const codexAcpTemporaryCompatAdapter = readFileSync(
      "src/main/lib/codex/acp-temporary-compat-adapter.ts",
      "utf8",
    )
    const claudePrompt = readFileSync(
      "src/main/lib/claude/agent-sdk-prompt.ts",
      "utf8",
    )
    const codexPrompt = readFileSync("src/main/lib/codex/prompt.ts", "utf8")
    const codexAcpTextStream = readFileSync(
      "src/main/lib/codex/acp-text-stream.ts",
      "utf8",
    )
    const ipc = readFileSync(
      "src/renderer/features/agents/lib/ipc-chat-transport.ts",
      "utf8",
    )
    const acp = readFileSync(
      "src/renderer/features/agents/lib/acp-chat-transport.ts",
      "utf8",
    )
    const authRetry = readFileSync(
      "src/renderer/features/agents/hooks/use-auth-retry.ts",
      "utf8",
    )

    expect(claude).not.toContain("prependLongTextAttachmentPromptBlocks")
    expect(claude).toContain("input.longTextAttachments")
    expect(claudePrompt).toContain("prependLongTextAttachmentPromptBlocks")
    expect(claudePrompt).toContain("Long text attachment unavailable")
    expect(codexAcpTemporaryCompatAdapter).toContain("prepareCodexAcpPrompt")
    expect(codexPrompt).toContain("prependLongTextAttachmentPromptBlocks")
    expect(codex).toContain("input.longTextAttachments")
    expect(codexAcpTemporaryCompatAdapter).toContain(
      "createCodexAcpUiMessageStream",
    )
    expect(codexAcpTextStream).toContain("streamText({")
    expect(ipc).toContain("extractLongTextAttachments(lastUser)")
    expect(ipc).toContain("{ longTextAttachments }")
    expect(acp).toContain("extractLongTextAttachments(lastUser)")
    expect(acp).toContain("{ longTextAttachments }")
    expect(authRetry).toContain("longTextAttachments")
  })
})
