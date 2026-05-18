import { useEffect } from "react"
import { useAtom } from "jotai"
import {
  pendingConflictResolutionMessageAtom,
  pendingPrMessageAtom,
  pendingReviewMessageAtom,
} from "../atoms"
import { useAgentSubChatStore } from "../stores/sub-chat-store"

type PendingMessagePart = { type: "text"; text: string }

type SendPendingMessage = (message: {
  role: "user"
  parts: PendingMessagePart[]
}) => void

export function usePendingAgentMessages({
  subChatId,
  isStreaming,
  sendMessage,
  setIsCreatingPr,
}: {
  subChatId: string
  isStreaming: boolean
  sendMessage: SendPendingMessage
  setIsCreatingPr: (isCreating: boolean) => void
}) {
  const [pendingPrMessage, setPendingPrMessage] = useAtom(pendingPrMessageAtom)
  const [pendingReviewMessage, setPendingReviewMessage] = useAtom(
    pendingReviewMessageAtom,
  )
  const [pendingConflictMessage, setPendingConflictMessage] = useAtom(
    pendingConflictResolutionMessageAtom,
  )

  useEffect(() => {
    if (pendingPrMessage?.subChatId !== subChatId || isStreaming) return

    setPendingPrMessage(null)
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: pendingPrMessage.message }],
    })

    setIsCreatingPr(false)

    const store = useAgentSubChatStore.getState()
    store.addToOpenSubChats(subChatId)
    store.setActiveSubChat(subChatId)
  }, [
    pendingPrMessage,
    isStreaming,
    sendMessage,
    setPendingPrMessage,
    setIsCreatingPr,
    subChatId,
  ])

  useEffect(() => {
    if (pendingReviewMessage?.subChatId !== subChatId || isStreaming) return

    setPendingReviewMessage(null)
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: pendingReviewMessage.message }],
    })
  }, [
    pendingReviewMessage,
    isStreaming,
    sendMessage,
    setPendingReviewMessage,
    subChatId,
  ])

  useEffect(() => {
    if (pendingConflictMessage?.subChatId !== subChatId || isStreaming) return

    setPendingConflictMessage(null)
    sendMessage({
      role: "user",
      parts: [{ type: "text", text: pendingConflictMessage.message }],
    })
  }, [
    pendingConflictMessage,
    isStreaming,
    sendMessage,
    setPendingConflictMessage,
    subChatId,
  ])
}
