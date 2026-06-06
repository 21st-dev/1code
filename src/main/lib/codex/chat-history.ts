import { z } from "zod"
import {
  imageAttachmentSchema,
  longTextAttachmentSchema,
} from "./chat-input-schema"

export function buildCodexLongTextAttachmentParts(
  attachments: z.infer<typeof longTextAttachmentSchema>[] | undefined,
): any[] {
  return (attachments ?? []).map((attachment) => ({
    type: "long-text-attachment",
    attachmentId: attachment.attachmentId,
    localRef: attachment.localRef,
    filename: attachment.filename,
    byteLength: attachment.byteLength,
    preview: attachment.preview ?? "",
    kind: attachment.kind,
  }))
}

export function codexLongTextAttachmentSignatureFromParts(
  parts: any[] | undefined,
): string {
  return JSON.stringify(
    (parts ?? [])
      .filter((part: any) => part?.type === "long-text-attachment")
      .map((part: any) => ({
        localRef: part.localRef,
        byteLength: part.byteLength,
        kind: part.kind,
      })),
  )
}

export function codexLongTextAttachmentSignatureFromInput(
  attachments: z.infer<typeof longTextAttachmentSchema>[] | undefined,
): string {
  return JSON.stringify(
    (attachments ?? []).map((attachment) => ({
      localRef: attachment.localRef,
      byteLength: attachment.byteLength,
      kind: attachment.kind,
    })),
  )
}

export function codexImageAttachmentSignatureFromParts(
  parts: any[] | undefined,
): string {
  return JSON.stringify(
    (parts ?? [])
      .filter(
        (part: any) =>
          part?.type === "attachment-image" || part?.type === "data-image",
      )
      .map((part: any) => {
        if (part.type === "attachment-image") {
          return {
            localRef: part.localRef,
            sizeBytes: part.sizeBytes,
            mediaType: part.mediaType,
          }
        }
        return {
          legacy: true,
          filename: part.data?.filename,
          mediaType: part.data?.mediaType,
          base64Length:
            typeof part.data?.base64Data === "string"
              ? part.data.base64Data.length
              : 0,
        }
      }),
  )
}

export function codexImageAttachmentSignatureFromInput(
  images: z.infer<typeof imageAttachmentSchema>[] | undefined,
): string {
  return JSON.stringify(
    (images ?? []).map((image) => ({
      localRef: image.localRef,
      sizeBytes: image.sizeBytes,
      mediaType: image.mediaType,
      legacy: image.localRef ? undefined : Boolean(image.base64Data),
      base64Length:
        !image.localRef && image.base64Data ? image.base64Data.length : 0,
    })),
  )
}

export function parseCodexStoredMessages(raw: string | null | undefined): any[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function extractCodexPromptFromStoredMessage(message: any): string {
  if (!message || !Array.isArray(message.parts)) return ""

  const textParts: string[] = []
  const fileContents: string[] = []

  for (const part of message.parts) {
    if (part?.type === "text" && typeof part.text === "string") {
      textParts.push(part.text)
    } else if (part?.type === "file-content") {
      const filePath =
        typeof part.filePath === "string" ? part.filePath : undefined
      const fileName = filePath?.split("/").pop() || filePath || "file"
      const content = typeof part.content === "string" ? part.content : ""
      fileContents.push(`\n--- ${fileName} ---\n${content}`)
    }
  }

  return textParts.join("\n") + fileContents.join("")
}

export function getLastCodexSessionId(messages: any[]): string | undefined {
  const lastAssistant = [...messages]
    .reverse()
    .find((message) => message?.role === "assistant")
  const sessionId = lastAssistant?.metadata?.sessionId
  return typeof sessionId === "string" ? sessionId : undefined
}

export function buildCodexUserParts(
  prompt: string,
  images:
    | Array<{
        base64Data?: string
        localRef?: string
        attachmentId?: string
        mediaType?: string
        filename?: string
        sizeBytes?: number
        width?: number
        height?: number
        sha256?: string
      }>
    | undefined,
  longTextAttachments?: z.infer<typeof longTextAttachmentSchema>[],
): any[] {
  const parts: any[] = [{ type: "text", text: prompt }]

  if (images && images.length > 0) {
    for (const image of images) {
      if (image.localRef && image.mediaType) {
        parts.push({
          type: "attachment-image",
          attachmentId: image.attachmentId || image.localRef,
          localRef: image.localRef,
          filename: image.filename || "image",
          mediaType: image.mediaType,
          sizeBytes: image.sizeBytes || 0,
          width: image.width,
          height: image.height,
          sha256: image.sha256,
        })
        continue
      }
      if (!image.base64Data || !image.mediaType) continue
      parts.push({
        type: "data-image",
        data: {
          base64Data: image.base64Data,
          mediaType: image.mediaType,
          filename: image.filename,
        },
      })
    }
  }

  parts.push(...buildCodexLongTextAttachmentParts(longTextAttachments))

  return parts
}
