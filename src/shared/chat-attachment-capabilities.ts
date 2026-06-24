import {
  CHAT_IMAGE_MAX_COUNT,
  CHAT_IMAGE_SINGLE_LIMIT_BYTES,
  supportedChatImageMediaTypes,
} from "./chat-attachments"
import {
  type ProviderProfileMetadata,
  parseProviderProfileSource,
} from "./provider-profile-types"

export type ChatAttachmentProvider =
  | "claude-code"
  | "codex"
  | "qwen-code"
  | "kun"

export type ChatImageModelVision = "supported" | "unsupported" | "unknown"
export type ChatImageAttachmentBlockReason =
  | "runtime-transport"
  | "offline"
  | "model-no-vision"

export type ChatImageProviderProfileMetadata = Pick<
  ProviderProfileMetadata,
  "id" | "capabilities"
>

export type ChatImageAttachmentCapability = {
  supportsImages: boolean
  maxImages: number
  maxImageBytes: number
  supportedMediaTypes: readonly string[]
  disclosureKey: "remote-provider"
  blockReason?: ChatImageAttachmentBlockReason
}

function providerProfileModelVision(
  profile: ChatImageProviderProfileMetadata | null | undefined,
): ChatImageModelVision {
  if (!profile) return "unknown"
  if (profile.capabilities.vision === true) return "supported"
  if (profile.capabilities.vision === false) return "unsupported"
  return "unknown"
}

function findProviderProfileMetadata(input: {
  profileId: string
  providerProfiles?: readonly ChatImageProviderProfileMetadata[]
  getProviderProfileMetadata?: (
    id: string,
  ) => ChatImageProviderProfileMetadata | null | undefined
}): ChatImageProviderProfileMetadata | null | undefined {
  if (input.getProviderProfileMetadata) {
    return input.getProviderProfileMetadata(input.profileId)
  }
  return input.providerProfiles?.find(
    (profile) => profile.id === input.profileId,
  )
}

export function resolveChatImageModelVision(input: {
  provider: ChatAttachmentProvider
  modelSource?: string | null
  providerProfileId?: string | null
  providerProfiles?: readonly ChatImageProviderProfileMetadata[]
  getProviderProfileMetadata?: (
    id: string,
  ) => ChatImageProviderProfileMetadata | null | undefined
}): ChatImageModelVision {
  const providerProfileId =
    input.providerProfileId?.trim() ||
    parseProviderProfileSource(input.modelSource)

  if (providerProfileId) {
    return providerProfileModelVision(
      findProviderProfileMetadata({
        profileId: providerProfileId,
        providerProfiles: input.providerProfiles,
        getProviderProfileMetadata: input.getProviderProfileMetadata,
      }),
    )
  }

  const modelSource = input.modelSource?.trim()
  if (input.provider === "claude-code") {
    if (!modelSource || modelSource === "claude-oauth") return "supported"
    if (modelSource === "auto" || modelSource === "custom-provider") {
      return "unknown"
    }
    return "unknown"
  }

  if (input.provider === "codex") {
    if (
      !modelSource ||
      modelSource === "chatgpt" ||
      modelSource === "openai-api-key"
    ) {
      return "supported"
    }
    return "unknown"
  }

  return "unknown"
}

export function getChatImageAttachmentCapability(input: {
  provider: ChatAttachmentProvider
  offlineModeEnabled?: boolean
  modelVision?: ChatImageModelVision
}): ChatImageAttachmentCapability {
  if (input.provider === "qwen-code" || input.provider === "kun") {
    return {
      supportsImages: false,
      maxImages: CHAT_IMAGE_MAX_COUNT,
      maxImageBytes: CHAT_IMAGE_SINGLE_LIMIT_BYTES,
      supportedMediaTypes: supportedChatImageMediaTypes,
      disclosureKey: "remote-provider",
      blockReason: "runtime-transport",
    }
  }

  if (input.provider === "claude-code" && input.offlineModeEnabled) {
    return {
      supportsImages: false,
      maxImages: CHAT_IMAGE_MAX_COUNT,
      maxImageBytes: CHAT_IMAGE_SINGLE_LIMIT_BYTES,
      supportedMediaTypes: supportedChatImageMediaTypes,
      disclosureKey: "remote-provider",
      blockReason: "offline",
    }
  }

  if (input.modelVision !== "supported") {
    return {
      supportsImages: false,
      maxImages: CHAT_IMAGE_MAX_COUNT,
      maxImageBytes: CHAT_IMAGE_SINGLE_LIMIT_BYTES,
      supportedMediaTypes: supportedChatImageMediaTypes,
      disclosureKey: "remote-provider",
      blockReason: "model-no-vision",
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
