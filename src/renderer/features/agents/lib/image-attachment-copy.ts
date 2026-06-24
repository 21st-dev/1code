import type { ChatImageAttachmentBlockReason } from "../../../../shared/chat-attachment-capabilities"

export type ImageAttachmentBlockDescriptionKey =
  | "agent.attachments.imagesUnsupportedRuntime"
  | "agent.attachments.imagesUnsupportedOffline"
  | "agent.attachments.imagesUnsupportedModel"

export function imageAttachmentBlockDescriptionKey(
  reason: ChatImageAttachmentBlockReason | undefined,
): ImageAttachmentBlockDescriptionKey {
  if (reason === "runtime-transport") {
    return "agent.attachments.imagesUnsupportedRuntime"
  }
  if (reason === "offline") {
    return "agent.attachments.imagesUnsupportedOffline"
  }
  return "agent.attachments.imagesUnsupportedModel"
}
