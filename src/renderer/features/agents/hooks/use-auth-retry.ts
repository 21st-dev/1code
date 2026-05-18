import { useEffect } from "react"
import { useAtom } from "jotai"
import { pendingAuthRetryMessageAtom } from "../atoms"

type AuthRetryProvider = "claude-code" | "codex"

type AuthRetryPart =
  | { type: "text"; text: string }
  | { type: "data-image"; data: unknown }

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
  provider: AuthRetryProvider
  isStreaming: boolean
  sendMessage: SendAuthRetryMessage
}) {
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(
    pendingAuthRetryMessageAtom,
  )

  useEffect(() => {
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
      parts.push({
        type: "data-image",
        data: {
          base64Data: img.base64Data,
          mediaType: img.mediaType,
          filename: img.filename,
        },
      })
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
