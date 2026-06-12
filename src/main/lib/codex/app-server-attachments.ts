import {
  isSupportedChatImageMediaType,
  type ChatImageMediaType,
  type ResolvedChatImageAttachment,
} from "../../../shared/chat-attachments"
import type { DesktopRunAttachmentRef } from "../agent-runtime/desktop-run-request"
import {
  prependLongTextAttachmentPromptBlocks,
  type ResolveLongTextAttachmentInput,
} from "../long-text-attachments"

export type CodexAppServerUserInput =
  | {
      type: "text"
      text: string
      text_elements: []
    }
  | {
      type: "image"
      url: string
      detail?: "high" | "original"
    }

export class CodexAppServerUnsupportedAttachmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CodexAppServerUnsupportedAttachmentError"
  }
}

function imageDataUrl(
  mediaType: ChatImageMediaType,
  base64Data: string,
): string {
  return `data:${mediaType};base64,${base64Data}`
}

export function assertCodexAppServerAttachmentRefsSupported(
  attachments: DesktopRunAttachmentRef[],
  resolvedImages: ResolvedChatImageAttachment[],
  options: { allowPreparedLongTextRefs?: boolean } = {},
): void {
  const imageRefs = attachments.filter((attachment) => attachment.kind === "image")
  const unsupported = attachments.find(
    (attachment) =>
      attachment.kind !== "image" &&
      !(options.allowPreparedLongTextRefs && attachment.kind === "long-text"),
  )
  if (unsupported) {
    throw new CodexAppServerUnsupportedAttachmentError(
      `Unsupported Codex app-server attachment kind: ${unsupported.kind}`,
    )
  }

  if (imageRefs.length > resolvedImages.length) {
    throw new CodexAppServerUnsupportedAttachmentError(
      "Codex app-server image attachments must be resolved in the main process before startup.",
    )
  }
}

export function buildCodexAppServerUserInputItems(input: {
  prompt: string
  resolvedImages?: ResolvedChatImageAttachment[]
  attachmentRefs?: DesktopRunAttachmentRef[]
  allowPreparedLongTextRefs?: boolean
}): CodexAppServerUserInput[] {
  const resolvedImages = input.resolvedImages ?? []
  assertCodexAppServerAttachmentRefsSupported(
    input.attachmentRefs ?? [],
    resolvedImages,
    { allowPreparedLongTextRefs: input.allowPreparedLongTextRefs },
  )

  const items: CodexAppServerUserInput[] = [
    {
      type: "text",
      text: input.prompt,
      text_elements: [],
    },
  ]

  for (const image of resolvedImages) {
    if (!isSupportedChatImageMediaType(image.mediaType)) {
      throw new CodexAppServerUnsupportedAttachmentError(
        `Unsupported Codex app-server image media type: ${image.mediaType}`,
      )
    }
    if (!image.base64Data) {
      throw new CodexAppServerUnsupportedAttachmentError(
        "Codex app-server image attachment is missing resolved image data.",
      )
    }

    items.push({
      type: "image",
      url: imageDataUrl(image.mediaType, image.base64Data),
    })
  }

  return items
}

export async function prepareCodexAppServerPromptWithLongText(input: {
  prompt: string
  longTextAttachments?: ResolveLongTextAttachmentInput[]
  prependLongTextPromptBlocks?: typeof prependLongTextAttachmentPromptBlocks
}): Promise<string> {
  const prependLongTextPromptBlocks =
    input.prependLongTextPromptBlocks ?? prependLongTextAttachmentPromptBlocks
  return prependLongTextPromptBlocks(input.prompt, input.longTextAttachments)
}
