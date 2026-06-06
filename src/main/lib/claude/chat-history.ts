import { z } from "zod"
import {
  imageAttachmentSchema,
  longTextAttachmentSchema,
} from "./chat-input-schema"

export function buildClaudeLongTextAttachmentParts(
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

export function claudeLongTextAttachmentSignatureFromParts(
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

export function claudeLongTextAttachmentSignatureFromInput(
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

export function claudeImageAttachmentSignatureFromParts(
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

export function claudeImageAttachmentSignatureFromInput(
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

export function buildClaudeChatImageAttachmentParts(
  images: z.infer<typeof imageAttachmentSchema>[] | undefined,
): any[] {
  return (images ?? []).map((image) => {
    if (image.localRef) {
      return {
        type: "attachment-image",
        attachmentId: image.attachmentId || image.localRef,
        localRef: image.localRef,
        filename: image.filename || "image",
        mediaType: image.mediaType,
        sizeBytes: image.sizeBytes || 0,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
      }
    }

    return {
      type: "data-image",
      data: {
        base64Data: image.base64Data,
        mediaType: image.mediaType,
        filename: image.filename,
      },
    }
  })
}

export function buildClaudeUserParts(
  prompt: string,
  images: z.infer<typeof imageAttachmentSchema>[] | undefined,
  longTextAttachments?: z.infer<typeof longTextAttachmentSchema>[],
): any[] {
  const parts: any[] = [{ type: "text", text: prompt }]
  parts.push(...buildClaudeChatImageAttachmentParts(images))
  parts.push(...buildClaudeLongTextAttachmentParts(longTextAttachments))
  return parts
}
