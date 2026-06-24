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
import {
  getChatImageAttachmentCapability,
  resolveChatImageModelVision,
} from "../src/shared/chat-attachment-capabilities"

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
    const claudeChatHistory = readFileSync(
      "src/main/lib/claude/chat-history.ts",
      "utf8",
    )
    const claudeDesktopRunInputs = readFileSync(
      "src/main/lib/claude/agent-sdk-desktop-run-inputs.ts",
      "utf8",
    )
    const codex = readFileSync("src/main/lib/trpc/routers/codex.ts", "utf8")
    const codexChatHistory = readFileSync(
      "src/main/lib/codex/chat-history.ts",
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

    expect(claude).toContain("prepareClaudeAgentSdkDesktopRunInputs")
    expect(claude).not.toContain("prepareChatImageAttachmentsForDesktopRun")
    expect(claudeDesktopRunInputs).toContain(
      "prepareChatImageAttachmentsForDesktopRun",
    )
    expect(claude).not.toContain("resolveChatImageAttachments(input.images)")
    expect(claude).not.toContain("buildClaudeUserParts(")
    expect(claudeChatHistory).toContain("buildClaudeUserParts(")
    expect(claudeChatHistory).toContain("buildClaudeChatImageAttachmentParts(")
    expect(codex).toContain("prepareChatImageAttachmentsForDesktopRun")
    expect(codex).not.toContain("resolveChatImageAttachments(input.images)")
    expect(codex).toContain("buildCodexUserParts(")
    expect(codexChatHistory).toContain("buildCodexUserParts(")
    expect(ipc).toContain("normalizeChatImageAttachmentPart(part)")
    expect(acp).toContain("normalizeChatImageAttachmentPart(part)")
    expect(authRetry).toContain('type: "attachment-image"')

    const normalizeSourceIndex = ipc.indexOf(
      "const normalizedSource = normalizeClaudeModelSourceForRun({",
    )
    const admissionBlockerThrowIndex = ipc.indexOf(
      "throw new Error(normalizedSource.blocker.message)",
      normalizeSourceIndex,
    )
    const subscribeImagesIndex = ipc.indexOf(
      "...(images.length > 0 && { images })",
      normalizeSourceIndex,
    )
    expect(normalizeSourceIndex).toBeGreaterThan(0)
    expect(admissionBlockerThrowIndex).toBeGreaterThan(normalizeSourceIndex)
    expect(subscribeImagesIndex).toBeGreaterThan(admissionBlockerThrowIndex)
  })

  test("provider capability model resolves first-party and provider-profile image support", () => {
    const providerProfiles = [
      { id: "vision-profile", capabilities: { vision: true } },
      { id: "text-profile", capabilities: { vision: false } },
      { id: "unknown-profile", capabilities: {} },
    ]

    expect(
      resolveChatImageModelVision({
        provider: "claude-code",
        modelSource: "claude-oauth",
        providerProfiles,
      }),
    ).toBe("supported")
    expect(
      resolveChatImageModelVision({
        provider: "codex",
        modelSource: "chatgpt",
        providerProfiles,
      }),
    ).toBe("supported")
    expect(
      resolveChatImageModelVision({
        provider: "codex",
        modelSource: "openai-api-key",
        providerProfiles,
      }),
    ).toBe("supported")
    expect(
      resolveChatImageModelVision({
        provider: "claude-code",
        modelSource: "auto",
        providerProfiles,
      }),
    ).toBe("unknown")
    expect(
      resolveChatImageModelVision({
        provider: "claude-code",
        modelSource: "custom-provider",
        providerProfiles,
      }),
    ).toBe("unknown")
    expect(
      resolveChatImageModelVision({
        provider: "claude-code",
        modelSource: "provider-profile:vision-profile",
        providerProfiles,
      }),
    ).toBe("supported")
    expect(
      resolveChatImageModelVision({
        provider: "claude-code",
        modelSource: "provider-profile:text-profile",
        providerProfiles,
      }),
    ).toBe("unsupported")
    expect(
      resolveChatImageModelVision({
        provider: "codex",
        providerProfileId: "unknown-profile",
        providerProfiles,
      }),
    ).toBe("unknown")
    expect(
      resolveChatImageModelVision({
        provider: "codex",
        providerProfileId: "deleted-profile",
        providerProfiles,
      }),
    ).toBe("unknown")
  })

  test("provider capability model blocks unsupported image sends with specific reasons", () => {
    expect(
      getChatImageAttachmentCapability({
        provider: "claude-code",
        offlineModeEnabled: true,
        modelVision: "supported",
      }),
    ).toMatchObject({
      supportsImages: false,
      blockReason: "offline",
    })

    expect(
      getChatImageAttachmentCapability({
        provider: "codex",
        offlineModeEnabled: true,
        modelVision: "supported",
      }).supportsImages,
    ).toBe(true)

    expect(
      getChatImageAttachmentCapability({
        provider: "codex",
        modelVision: "unknown",
      }),
    ).toMatchObject({
      supportsImages: false,
      blockReason: "model-no-vision",
    })

    expect(
      getChatImageAttachmentCapability({
        provider: "qwen-code",
        modelVision: "supported",
      }).supportsImages,
    ).toBe(false)
    expect(
      getChatImageAttachmentCapability({
        provider: "kun",
        modelVision: "supported",
      }),
    ).toMatchObject({
      supportsImages: false,
      blockReason: "runtime-transport",
    })
  })
})
