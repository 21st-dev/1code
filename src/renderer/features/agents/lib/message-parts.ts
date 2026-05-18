import { MENTION_PREFIXES } from "../mentions"
import { utf8ToBase64 } from "../utils/base64"

type SendableImage = {
  isLoading?: boolean
  url?: string
  mediaType?: string
  filename?: string
  base64Data?: string
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

type MentionPastedText = {
  filePath: string
  size: number
  preview: string
  kind?: "pasted" | "chatHistory"
}

export type AgentUserMessagePart =
  | {
      type: "data-image"
      data: {
        url: string
        mediaType?: string
        filename?: string
        base64Data?: string
      }
    }
  | {
      type: "data-file"
      data: {
        url: string
        mediaType?: string
        filename: string
        size?: number
      }
    }
  | { type: "text"; text: string }
  | { type: "file-content"; filePath: string; content: string }

function sanitizePreview(preview: string, extraChars = "") {
  const escapedExtra = extraChars.replace(/[\\\]^]/g, "\\$&")
  return preview.replace(new RegExp(`[:\\[\\]${escapedExtra}]`, "g"), "")
}

function contextPreview(ctx: MentionTextContext | MentionDiffTextContext) {
  return ctx.preview ?? ctx.text.slice(0, 50)
}

export function buildMentionPrefix({
  textContexts = [],
  diffTextContexts = [],
  pastedTexts = [],
}: {
  textContexts?: MentionTextContext[]
  diffTextContexts?: MentionDiffTextContext[]
  pastedTexts?: MentionPastedText[]
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

  const pastedMentions = pastedTexts.map((pt) => {
    const sanitizedPreview = sanitizePreview(pt.preview, "|")
    const prefix =
      pt.kind === "chatHistory"
        ? MENTION_PREFIXES.CHAT_HISTORY
        : MENTION_PREFIXES.PASTED
    return `@[${prefix}${pt.size}:${sanitizedPreview}|${pt.filePath}]`
  })

  const mentions = [...quoteMentions, ...diffMentions, ...pastedMentions]
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
      .filter((img) => !img.isLoading && img.url)
      .map((img) => ({
        type: "data-image" as const,
        data: {
          url: img.url!,
          mediaType: img.mediaType,
          filename: img.filename,
          base64Data: img.base64Data,
        },
      })),
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
    pastedTexts,
  })

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
