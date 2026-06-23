import { useEffect } from "react"
import { useAtom } from "jotai"
import { pendingAuthRetryMessageAtom } from "../atoms"
import type { AgentChatProvider } from "../../../../shared/agent-chat-provider"
import type { LongTextAttachmentPart } from "../../../../shared/long-text-attachments"
import {
  isSupportedChatImageMediaType,
  type ChatImageAttachmentPart,
} from "../../../../shared/chat-attachments"

type AuthRetryPart =
  | { type: "text"; text: string }
  | { type: "data-image"; data: unknown }
  | ChatImageAttachmentPart
  | LongTextAttachmentPart

type SendAuthRetryMessage = (message: {
  role: "user"
  parts: AuthRetryPart[]
}) => void

export function useAuthRetry({
  subChatId,
  provider,
  isStreaming,
  sendMessage,
}: {
  subChatId: string
  provider: AgentChatProvider
  isStreaming: boolean
  sendMessage: SendAuthRetryMessage
}) {
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(
    pendingAuthRetryMessageAtom,
  )

  useEffect(() => {
    if (provider === "qwen-code") {
      return
    }

    if (
      !pendingAuthRetry ||
      !pendingAuthRetry.readyToRetry ||
      pendingAuthRetry.subChatId !== subChatId ||
      pendingAuthRetry.provider !== provider ||
      isStreaming
    ) {
      return
    }

    setPendingAuthRetry(null)

    const parts: AuthRetryPart[] = [
      { type: "text", text: pendingAuthRetry.prompt },
    ]

    for (const img of pendingAuthRetry.images ?? []) {
      if (img.localRef && isSupportedChatImageMediaType(img.mediaType)) {
        parts.push({
          type: "attachment-image",
          attachmentId: img.attachmentId || img.localRef,
          localRef: img.localRef,
          filename: img.filename || "image",
          mediaType: img.mediaType,
          sizeBytes: img.sizeBytes || 0,
          width: img.width,
          height: img.height,
          sha256: img.sha256,
        })
      } else {
        parts.push({
          type: "data-image",
          data: {
            base64Data: img.base64Data,
            mediaType: img.mediaType,
            filename: img.filename,
          },
        })
      }
    }

    for (const attachment of pendingAuthRetry.longTextAttachments ?? []) {
      parts.push(attachment)
    }

    sendMessage({
      role: "user",
      parts,
    })
  }, [
    pendingAuthRetry,
    provider,
    isStreaming,
    sendMessage,
    setPendingAuthRetry,
    subChatId,
  ])
}
