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

export function normalizeLongTextAttachmentPart(
  value: unknown
): LongTextAttachmentPart | null {
  if (!value || typeof value !== "object") return null

  const part = value as Record<string, unknown>
  if (
    part.type !== "long-text-attachment" ||
    typeof part.localRef !== "string"
  ) {
    return null
  }

  return {
    type: "long-text-attachment",
    attachmentId:
      typeof part.attachmentId === "string"
        ? part.attachmentId
        : `pasted_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    localRef: part.localRef,
    filename: typeof part.filename === "string" ? part.filename : "pasted.txt",
    byteLength: typeof part.byteLength === "number" ? part.byteLength : 0,
    preview: typeof part.preview === "string" ? part.preview : "",
    kind: part.kind === "chatHistory" ? "chatHistory" : "pasted",
  }
}
