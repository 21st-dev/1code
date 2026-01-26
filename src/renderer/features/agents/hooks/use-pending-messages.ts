import { useEffect } from "react"
import { useAtom, useSetAtom } from "jotai"
import {
  pendingPrMessageAtom,
  pendingReviewMessageAtom,
  pendingConflictResolutionMessageAtom,
  pendingAuthRetryMessageAtom,
  isCreatingPrAtom,
} from "../atoms"

/**
 * Custom hook to handle pending messages that need to be sent automatically
 * Watches for pending PR, Review, Conflict Resolution, and Auth Retry messages
 * and sends them when streaming is not active
 */
export function usePendingMessages({
  subChatId,
  isStreaming,
  sendMessage,
}: {
  subChatId: string
  isStreaming: boolean
  sendMessage: (message: { role: "user"; parts: Array<{ type: "text"; text: string } | { type: "data-image"; data: any }> }) => void
}) {
  const [pendingPrMessage, setPendingPrMessage] = useAtom(pendingPrMessageAtom)
  const [pendingReviewMessage, setPendingReviewMessage] = useAtom(pendingReviewMessageAtom)
  const [pendingConflictMessage, setPendingConflictMessage] = useAtom(
    pendingConflictResolutionMessageAtom,
  )
  const [pendingAuthRetry, setPendingAuthRetry] = useAtom(pendingAuthRetryMessageAtom)
  const setIsCreatingPr = useSetAtom(isCreatingPrAtom)

  // Watch for pending PR message and send it
  useEffect(() => {
    if (pendingPrMessage && !isStreaming) {
      // Clear the pending message immediately to prevent double-sending
      setPendingPrMessage(null)

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingPrMessage }],
      })

      // Reset creating PR state after message is sent
      setIsCreatingPr(false)
    }
  }, [pendingPrMessage, isStreaming, sendMessage, setPendingPrMessage, setIsCreatingPr])

  // Watch for pending Review message and send it
  useEffect(() => {
    if (pendingReviewMessage && !isStreaming) {
      // Clear the pending message immediately to prevent double-sending
      setPendingReviewMessage(null)

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingReviewMessage }],
      })
    }
  }, [pendingReviewMessage, isStreaming, sendMessage, setPendingReviewMessage])

  // Watch for pending conflict resolution message and send it
  useEffect(() => {
    if (pendingConflictMessage && !isStreaming) {
      // Clear the pending message immediately to prevent double-sending
      setPendingConflictMessage(null)

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts: [{ type: "text", text: pendingConflictMessage }],
      })
    }
  }, [pendingConflictMessage, isStreaming, sendMessage, setPendingConflictMessage])

  // Watch for pending auth retry message (after successful OAuth flow)
  useEffect(() => {
    // Only retry when:
    // 1. There's a pending message
    // 2. readyToRetry is true (set by modal on OAuth success)
    // 3. We're in the correct chat
    // 4. Not currently streaming
    if (
      pendingAuthRetry &&
      pendingAuthRetry.readyToRetry &&
      pendingAuthRetry.subChatId === subChatId &&
      !isStreaming
    ) {
      // Clear the pending message immediately to prevent double-sending
      setPendingAuthRetry(null)

      // Build message parts
      const parts: Array<
        { type: "text"; text: string } | { type: "data-image"; data: any }
      > = [{ type: "text", text: pendingAuthRetry.prompt }]

      // Add images if present
      if (pendingAuthRetry.images && pendingAuthRetry.images.length > 0) {
        for (const img of pendingAuthRetry.images) {
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

      // Send the message to Claude
      sendMessage({
        role: "user",
        parts,
      })
    }
  }, [
    pendingAuthRetry,
    isStreaming,
    sendMessage,
    setPendingAuthRetry,
    subChatId,
  ])
}
