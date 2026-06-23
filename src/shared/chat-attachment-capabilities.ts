import {
  CHAT_IMAGE_MAX_COUNT,
  CHAT_IMAGE_SINGLE_LIMIT_BYTES,
  supportedChatImageMediaTypes,
} from "./chat-attachments"

export type ChatAttachmentProvider =
  | "claude-code"
  | "codex"
  | "qwen-code"
  | "kun"

export type ChatImageAttachmentCapability = {
  supportsImages: boolean
  maxImages: number
  maxImageBytes: number
  supportedMediaTypes: readonly string[]
  disclosureKey: "remote-provider"
  blockReasonKey?: "offline-ollama"
}

export function getChatImageAttachmentCapability(input: {
  provider: ChatAttachmentProvider
  offlineModeEnabled?: boolean
}): ChatImageAttachmentCapability {
  if (input.provider === "qwen-code" || input.provider === "kun") {
    return {
      supportsImages: false,
      maxImages: CHAT_IMAGE_MAX_COUNT,
      maxImageBytes: CHAT_IMAGE_SINGLE_LIMIT_BYTES,
      supportedMediaTypes: supportedChatImageMediaTypes,
      disclosureKey: "remote-provider",
    }
  }

  if (input.provider === "claude-code" && input.offlineModeEnabled) {
    return {
      supportsImages: false,
      maxImages: CHAT_IMAGE_MAX_COUNT,
      maxImageBytes: CHAT_IMAGE_SINGLE_LIMIT_BYTES,
      supportedMediaTypes: supportedChatImageMediaTypes,
      disclosureKey: "remote-provider",
      blockReasonKey: "offline-ollama",
    }
  }

  return {
    supportsImages: true,
    maxImages: CHAT_IMAGE_MAX_COUNT,
    maxImageBytes: CHAT_IMAGE_SINGLE_LIMIT_BYTES,
    supportedMediaTypes: supportedChatImageMediaTypes,
    disclosureKey: "remote-provider",
  }
}
