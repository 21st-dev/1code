export const longTextAttachmentKinds = ["pasted", "chatHistory"] as const
export const LONG_TEXT_ATTACHMENT_REF_PREFIX = "lta:v1:"

export type LongTextAttachmentKind =
  (typeof longTextAttachmentKinds)[number]

/**
 * Metadata-only handle for long text staged outside renderer state.
 * The full body must stay behind localRef and should not be persisted in chat JSON.
 */
export type LongTextAttachment = {
  id: string
  filename: string
  byteLength: number
  preview: string
  localRef: string
  kind: LongTextAttachmentKind
}

export type LongTextAttachmentPart = Omit<LongTextAttachment, "id"> & {
  type: "long-text-attachment"
  attachmentId: string
}

export function toLongTextAttachmentPart(
  attachment: LongTextAttachment
): LongTextAttachmentPart {
  return {
    type: "long-text-attachment",
    attachmentId: attachment.id,
    filename: attachment.filename,
    byteLength: attachment.byteLength,
    preview: attachment.preview,
    localRef: attachment.localRef,
    kind: attachment.kind,
  }
}
