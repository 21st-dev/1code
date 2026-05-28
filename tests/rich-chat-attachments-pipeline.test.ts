import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { buildAgentMessageParts } from "../src/renderer/features/agents/lib/message-parts"
import {
  createQueueItem,
  toQueuedImage,
} from "../src/renderer/features/agents/lib/queue-utils"
import {
  fromDraftImage,
  toDraftImage,
} from "../src/renderer/features/agents/lib/drafts"
import type { UploadedImage } from "../src/renderer/features/agents/hooks/use-agents-file-upload"
import { getChatImageAttachmentCapability } from "../src/shared/chat-attachment-capabilities"

const UNIQUE_IMAGE_BODY = "UNIQUE_BASE64_IMAGE_BODY_SHOULD_NOT_PERSIST"

function sampleImage(): UploadedImage {
  return {
    id: "image_1",
    kind: "image",
    source: "clipboard",
    filename: "screenshot.png",
    url: "blob:locus-preview",
    localRef: "cia:v1:sub_chat_1/image_1.png",
    attachmentId: "image_1",
    mediaType: "image/png",
    sizeBytes: 68,
    width: 1,
    height: 1,
    sha256: "abc123",
    isLoading: false,
    status: "ready",
  }
}

describe("rich chat attachment send pipeline", () => {
  test("message parts persist image metadata only for new attachments", () => {
    const image = sampleImage()

    const parts = buildAgentMessageParts({
      text: "inspect this",
      images: [{ ...image, base64Data: UNIQUE_IMAGE_BODY }],
    })
    const serialized = JSON.stringify(parts)

    expect(parts[0]).toMatchObject({
      type: "attachment-image",
      attachmentId: image.attachmentId,
      localRef: image.localRef,
      filename: image.filename,
      mediaType: image.mediaType,
      sizeBytes: image.sizeBytes,
    })
    expect(parts.some((part) => part.type === "text")).toBe(true)
    expect(serialized).not.toContain(UNIQUE_IMAGE_BODY)
    expect(serialized).not.toContain("data-image")
  })

  test("draft and queue paths keep local refs without base64 image bodies", () => {
    const image = sampleImage()

    const draft = toDraftImage({ ...image, base64Data: UNIQUE_IMAGE_BODY })
    const persistedDraftJson = JSON.stringify(draft)
    const restored = fromDraftImage(JSON.parse(persistedDraftJson))
    const queued = toQueuedImage({ ...image, base64Data: UNIQUE_IMAGE_BODY })
    const item = createQueueItem(
      "queue_1",
      "",
      [queued],
      undefined,
      undefined,
      undefined,
      undefined,
    )
    const queuedParts = buildAgentMessageParts({
      images: item.images,
    })

    expect(persistedDraftJson).toContain(image.localRef)
    expect(persistedDraftJson).not.toContain(UNIQUE_IMAGE_BODY)
    expect(restored).toMatchObject({
      localRef: image.localRef,
      mediaType: image.mediaType,
      isLoading: true,
    })
    expect(JSON.stringify(item)).toContain(image.localRef)
    expect(JSON.stringify(item)).not.toContain(UNIQUE_IMAGE_BODY)
    expect(queuedParts[0]).toMatchObject({
      type: "attachment-image",
      localRef: image.localRef,
    })
  })

  test("Claude, Codex, and auth retry paths preserve refs and resolve in main", () => {
    const claude = readFileSync("src/main/lib/trpc/routers/claude.ts", "utf8")
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
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

    expect(claude).toContain("resolveChatImageAttachments(input.images)")
    expect(claude).toContain("buildChatImageAttachmentParts(input.images)")
    expect(codex).toContain("resolveChatImageAttachments(input.images)")
    expect(codex).toContain("buildUserParts(")
    expect(ipc).toContain("normalizeChatImageAttachmentPart(part)")
    expect(acp).toContain("normalizeChatImageAttachmentPart(part)")
    expect(authRetry).toContain('type: "attachment-image"')
  })

  test("provider capability model blocks offline Ollama image sends", () => {
    expect(
      getChatImageAttachmentCapability({
        provider: "claude-code",
        offlineModeEnabled: true,
      }),
    ).toMatchObject({
      supportsImages: false,
      blockReasonKey: "offline-ollama",
    })

    expect(
      getChatImageAttachmentCapability({
        provider: "codex",
        offlineModeEnabled: true,
      }).supportsImages,
    ).toBe(true)
  })
})
