import {
  type ChatImageAttachment,
  isSupportedChatImageMediaType,
  toChatImageAttachmentPart,
} from "../../../../shared/chat-attachments"
import type { CanonicalAgentUserMessagePart } from "../../../../shared/chat-message"
import type {
  LongTextAttachment,
} from "../../../../shared/long-text-attachments"
import { toLongTextAttachmentPart } from "../../../../shared/long-text-attachments"
import { MENTION_PREFIXES } from "../mentions/mention-prefixes"
import { utf8ToBase64 } from "../utils/base64"

type SendableImage = {
  id?: string
  isLoading?: boolean
  url?: string
  mediaType?: string
  filename?: string
  base64Data?: string
  localRef?: string
  attachmentId?: string
  sizeBytes?: number
  width?: number
  height?: number
  sha256?: string
  kind?: "image"
  source?: ChatImageAttachment["source"]
  status?: string
}

type SendableFile = {
  isLoading?: boolean
  url?: string
  type?: string
  mediaType?: string
  filename: string
  size?: number
}

type MentionTextContext = {
  text: string
  preview?: string
}

type MentionDiffTextContext = {
  text: string
  filePath: string
  lineNumber?: number
  preview?: string
}

type MentionPastedText = LongTextAttachment & {
  filePath: string
  size: number
}

export type AgentUserMessagePart = CanonicalAgentUserMessagePart

function sanitizePreview(preview: string, extraChars = "") {
  const escapedExtra = extraChars.replace(/[\\\]^]/g, "\\$&")
  return preview.replace(new RegExp(`[:\\[\\]${escapedExtra}]`, "g"), "")
}

function contextPreview(ctx: MentionTextContext | MentionDiffTextContext) {
  return ctx.preview ?? ctx.text.slice(0, 50)
}

function toSendableImagePart(
  img: SendableImage
): AgentUserMessagePart | null {
  if (img.isLoading || img.status === "failed") return null

  if (
    img.localRef &&
    img.mediaType &&
    isSupportedChatImageMediaType(img.mediaType)
  ) {
    return toChatImageAttachmentPart({
      id: img.attachmentId || img.id || img.localRef,
      kind: "image",
      source: img.source || "file-picker",
      filename: img.filename || "image",
      mediaType: img.mediaType,
      sizeBytes: img.sizeBytes || 0,
      width: img.width,
      height: img.height,
      sha256: img.sha256,
      localRef: img.localRef,
      status: "ready",
    })
  }

  if (!img.url) return null
  return {
    type: "data-image",
    data: {
      url: img.url,
      mediaType: img.mediaType,
      filename: img.filename,
      base64Data: img.base64Data,
    },
  }
}

export function buildMentionPrefix({
  textContexts = [],
  diffTextContexts = [],
}: {
  textContexts?: MentionTextContext[]
  diffTextContexts?: MentionDiffTextContext[]
}) {
  const quoteMentions = textContexts.map((tc) => {
    const preview = sanitizePreview(contextPreview(tc))
    const encodedText = utf8ToBase64(tc.text)
    return `@[${MENTION_PREFIXES.QUOTE}${preview}:${encodedText}]`
  })

  const diffMentions = diffTextContexts.map((dtc) => {
    const preview = sanitizePreview(contextPreview(dtc))
    const encodedText = utf8ToBase64(dtc.text)
    const lineNum = dtc.lineNumber || 0
    return `@[${MENTION_PREFIXES.DIFF}${dtc.filePath}:${lineNum}:${preview}:${encodedText}]`
  })

  const mentions = [...quoteMentions, ...diffMentions]
  return mentions.length > 0 ? `${mentions.join(" ")} ` : ""
}

export function buildAgentMessageParts({
  text,
  images = [],
  files = [],
  textContexts = [],
  diffTextContexts = [],
  pastedTexts = [],
  fileContents,
}: {
  text?: string
  images?: SendableImage[]
  files?: SendableFile[]
  textContexts?: MentionTextContext[]
  diffTextContexts?: MentionDiffTextContext[]
  pastedTexts?: MentionPastedText[]
  fileContents?: Iterable<[string, string]>
}) {
  const parts: AgentUserMessagePart[] = [
    ...images
      .map(toSendableImagePart)
      .filter((part): part is AgentUserMessagePart => part !== null),
    ...files
      .filter((file) => !file.isLoading && file.url)
      .map((file) => ({
        type: "data-file" as const,
        data: {
          url: file.url!,
          mediaType: file.mediaType,
          filename: file.filename,
          size: file.size,
        },
      })),
  ]

  const mentionPrefix = buildMentionPrefix({
    textContexts,
    diffTextContexts,
  })

  for (const pastedText of pastedTexts) {
    parts.push(toLongTextAttachmentPart(pastedText))
  }

  if (text || mentionPrefix) {
    parts.push({ type: "text", text: mentionPrefix + (text || "") })
  }

  if (fileContents) {
    for (const [mentionId, content] of fileContents) {
      const filePath = mentionId.replace(/^file:(local|external):/, "")
      parts.push({
        type: "file-content",
        filePath,
        content,
      })
    }
  }

  return parts
}
