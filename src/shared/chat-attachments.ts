export const CHAT_IMAGE_ATTACHMENT_REF_PREFIX = "cia:v1:"

export const supportedChatImageMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/bmp",
] as const

export type ChatImageMediaType =
  (typeof supportedChatImageMediaTypes)[number]

export type ChatImageAttachmentSource =
  | "file-picker"
  | "drag-drop"
  | "clipboard"
  | "screenshot"

export type ChatImageAttachmentStatus = "staging" | "ready" | "failed"

export const CHAT_IMAGE_MAX_COUNT = 5
export const CHAT_IMAGE_SINGLE_LIMIT_BYTES = 10 * 1024 * 1024
export const CHAT_IMAGE_AGGREGATE_LIMIT_BYTES = 25 * 1024 * 1024
export const CHAT_IMAGE_ATTACHMENT_CLEANUP_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type ChatImageAttachment = {
  id: string
  kind: "image"
  source: ChatImageAttachmentSource
  filename: string
  mediaType: ChatImageMediaType
  sizeBytes: number
  width?: number
  height?: number
  sha256?: string
  localRef: string
  previewUrl?: string
  status: ChatImageAttachmentStatus
  error?: string
}

export type ChatImageAttachmentPart = {
  type: "attachment-image"
  attachmentId: string
  localRef: string
  filename: string
  mediaType: ChatImageMediaType
  sizeBytes: number
  width?: number
  height?: number
  sha256?: string
}

export type ChatImageAttachmentSendInput = {
  attachmentId?: string
  localRef?: string
  filename?: string
  mediaType?: string
  sizeBytes?: number
  width?: number
  height?: number
  sha256?: string
  base64Data?: string
}

export type ResolvedChatImageAttachment = {
  attachmentId?: string
  localRef?: string
  filename?: string
  mediaType: ChatImageMediaType
  sizeBytes: number
  width?: number
  height?: number
  sha256?: string
  base64Data: string
}

const mediaTypeToExtensionMap: Record<ChatImageMediaType, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/bmp": ".bmp",
}

const extensionToMediaTypeMap: Record<string, ChatImageMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
}

export function isSupportedChatImageMediaType(
  mediaType: string | undefined
): mediaType is ChatImageMediaType {
  return supportedChatImageMediaTypes.some((type) => type === mediaType)
}

export function getChatImageExtension(
  mediaType: ChatImageMediaType
): string {
  return mediaTypeToExtensionMap[mediaType]
}

export function getChatImageMediaTypeForExtension(
  extension: string | undefined
): ChatImageMediaType | null {
  if (!extension) return null
  return extensionToMediaTypeMap[extension.toLowerCase()] ?? null
}

export function toChatImageAttachmentPart(
  attachment: ChatImageAttachment
): ChatImageAttachmentPart {
  return {
    type: "attachment-image",
    attachmentId: attachment.id,
    localRef: attachment.localRef,
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    sizeBytes: attachment.sizeBytes,
    width: attachment.width,
    height: attachment.height,
    sha256: attachment.sha256,
  }
}

export function normalizeChatImageAttachmentPart(
  value: unknown
): ChatImageAttachmentPart | null {
  if (!value || typeof value !== "object") return null

  const part = value as Record<string, unknown>
  if (
    part.type !== "attachment-image" ||
    typeof part.localRef !== "string" ||
    typeof part.filename !== "string" ||
    typeof part.mediaType !== "string" ||
    !isSupportedChatImageMediaType(part.mediaType)
  ) {
    return null
  }

  return {
    type: "attachment-image",
    attachmentId:
      typeof part.attachmentId === "string"
        ? part.attachmentId
        : `image_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    localRef: part.localRef,
    filename: part.filename,
    mediaType: part.mediaType,
    sizeBytes: typeof part.sizeBytes === "number" ? part.sizeBytes : 0,
    width: typeof part.width === "number" ? part.width : undefined,
    height: typeof part.height === "number" ? part.height : undefined,
    sha256: typeof part.sha256 === "string" ? part.sha256 : undefined,
  }
}

