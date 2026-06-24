import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getChatImageAttachmentCapability } from "../src/shared/chat-attachment-capabilities"
import {
  CHAT_IMAGE_ATTACHMENT_REF_PREFIX,
  CHAT_IMAGE_SINGLE_LIMIT_BYTES,
} from "../src/shared/chat-attachments"

let userDataDir = ""

mock.module("electron", () => ({
  app: {
    getPath(name: string) {
      if (name !== "userData") {
        throw new Error(`unexpected app path request: ${name}`)
      }
      return userDataDir
    },
  },
}))

const attachments = await import("../src/main/lib/chat-attachments")

const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII="
const supportedImageCapability = getChatImageAttachmentCapability({
  provider: "claude-code",
  modelVision: "supported",
})

describe("chat image attachments", () => {
  beforeEach(async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "locus-chat-images-"))
    attachments.setChatImageAttachmentsRootForTest(
      join(userDataDir, "chat-image-attachments"),
    )
  })

  afterEach(async () => {
    attachments.setChatImageAttachmentsRootForTest(null)
    await rm(userDataDir, { force: true, recursive: true })
    userDataDir = ""
  })

  test("stages image bytes behind an opaque local ref", async () => {
    const attachment = await attachments.stageChatImageAttachment({
      subChatId: "sub_chat_1",
      base64Data: tinyPngBase64,
      filename: "../unsafe name.png",
      mediaType: "image/png",
      source: "clipboard",
      width: 1,
      height: 1,
    })

    expect(attachment.localRef.startsWith(CHAT_IMAGE_ATTACHMENT_REF_PREFIX)).toBe(
      true,
    )
    expect(attachment.filename).toBe("unsafe name.png")
    expect(attachment.status).toBe("ready")
    expect(attachment.mediaType).toBe("image/png")
    expect(attachment.sizeBytes).toBe(Buffer.from(tinyPngBase64, "base64").length)

    const persisted = JSON.stringify(attachment)
    expect(persisted).not.toContain(tinyPngBase64)

    const resolved = await attachments.resolveChatImageAttachments([
      {
        attachmentId: attachment.id,
        localRef: attachment.localRef,
        filename: attachment.filename,
        mediaType: attachment.mediaType,
        sizeBytes: attachment.sizeBytes,
      },
    ])

    expect(resolved[0]?.base64Data).toBe(tinyPngBase64)
    expect(resolved[0]?.mediaType).toBe("image/png")
  })

  test("rejects unsupported media types", async () => {
    await expect(
      attachments.stageChatImageAttachment({
        subChatId: "sub_chat_1",
        base64Data: tinyPngBase64,
        filename: "vector.svg",
        mediaType: "image/svg+xml",
      }),
    ).rejects.toThrow("Unsupported image type")
  })

  test("rejects single images above the configured size limit", async () => {
    await expect(
      attachments.stageChatImageAttachment({
        subChatId: "sub_chat_1",
        base64Data: Buffer.alloc(CHAT_IMAGE_SINGLE_LIMIT_BYTES + 1).toString(
          "base64",
        ),
        filename: "huge.png",
        mediaType: "image/png",
      }),
    ).rejects.toThrow("too large")
  })

  test("deleted image refs cannot be resolved for runtime injection", async () => {
    const attachment = await attachments.stageChatImageAttachment({
      subChatId: "sub_chat_1",
      base64Data: tinyPngBase64,
      filename: "delete-me.png",
      mediaType: "image/png",
    })

    await attachments.deleteChatImageAttachment(attachment.localRef)

    await expect(
      attachments.resolveChatImageAttachments([
        {
          attachmentId: attachment.id,
          localRef: attachment.localRef,
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          sizeBytes: attachment.sizeBytes,
        },
      ]),
    ).rejects.toThrow()
  })

  test("prepares desktop run image attachments", async () => {
    const attachment = await attachments.stageChatImageAttachment({
      subChatId: "sub_chat_1",
      base64Data: tinyPngBase64,
      filename: "ready.png",
      mediaType: "image/png",
    })

    const result = await attachments.prepareChatImageAttachmentsForDesktopRun({
      images: [
        {
          attachmentId: attachment.id,
          localRef: attachment.localRef,
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          sizeBytes: attachment.sizeBytes,
        },
      ],
      imageCapability: supportedImageCapability,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected prepared image attachments")
    expect(result.attachments[0]?.base64Data).toBe(tinyPngBase64)
    expect(result.attachments[0]?.mediaType).toBe("image/png")
  })

  test("emits desktop preflight blockers for invalid image attachments", async () => {
    const blockers: unknown[] = []

    const result = await attachments.prepareChatImageAttachmentsForDesktopRun({
      images: [
        {
          base64Data: tinyPngBase64,
          mediaType: "image/svg+xml",
        },
      ],
      imageCapability: supportedImageCapability,
      emitPreflightBlocker: (blocker) => {
        blockers.push(blocker)
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected attachment preflight blocker")
    expect(result.blocker).toMatchObject({
      id: "attachment",
      status: "blocked",
      message: "Image attachment unavailable: Invalid image attachment",
    })
    expect(blockers).toEqual([result.blocker])
  })

  test("blocks image-bearing desktop runs when capability is omitted", async () => {
    const blockers: unknown[] = []

    const result = await attachments.prepareChatImageAttachmentsForDesktopRun({
      images: [
        {
          localRef: "not-a-chat-image-ref",
          mediaType: "image/png",
        },
      ],
      emitPreflightBlocker: (blocker) => {
        blockers.push(blocker)
      },
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected attachment preflight blocker")
    expect(result.blocker).toMatchObject({
      id: "attachment",
      status: "blocked",
      message:
        "Image attachment unavailable: current model cannot process image attachments",
    })
    expect(blockers).toEqual([result.blocker])
  })

  test("rejects malformed local refs that escape the storage root", async () => {
    await expect(
      attachments.resolveChatImageAttachments([
        {
          localRef: `${CHAT_IMAGE_ATTACHMENT_REF_PREFIX}../escape/file.png`,
          filename: "file.png",
          mediaType: "image/png",
          sizeBytes: 0,
        },
      ]),
    ).rejects.toThrow("Invalid chat image attachment reference")
  })
})
