import { useEffect, useRef } from "react"
import { trpcClient } from "../../../lib/trpc"
import { api } from "../../../lib/mock-api"

/**
 * Custom hook to detect PR URLs in assistant messages and update the database
 * Prevents duplicate updates by tracking the last detected PR URL
 */
export function usePrUrlDetection({
  messages,
  isStreaming,
  parentChatId,
  existingPrUrl,
}: {
  messages: any[]
  isStreaming: boolean
  parentChatId?: string
  existingPrUrl?: string | null
}) {
  const utils = api.useUtils()
  // Initialize with existing PR URL to prevent duplicate toast on re-mount
  const detectedPrUrlRef = useRef<string | null>(existingPrUrl ?? null)

  useEffect(() => {
    // Only check after streaming ends
    if (isStreaming) return

    // Look through messages for PR URLs
    for (const msg of messages) {
      if (msg.role !== "assistant") continue

      // Extract text content from message
      const textContent =
        msg.parts
          ?.filter((p: any) => p.type === "text")
          .map((p: any) => p.text)
          .join(" ") || ""

      // Match GitHub PR URL pattern
      const prUrlMatch = textContent.match(
        /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/,
      )

      if (prUrlMatch && prUrlMatch[0] !== detectedPrUrlRef.current) {
        const prUrl = prUrlMatch[0]
        const prNumber = parseInt(prUrlMatch[1], 10)

        // Store to prevent duplicate calls
        detectedPrUrlRef.current = prUrl

        // Update database
        trpcClient.chats.updatePrInfo
          .mutate({ chatId: parentChatId, prUrl, prNumber })
          .then(() => {
            // Invalidate the agentChat query to refetch with new PR info
            utils.agents.getAgentChat.invalidate({ chatId: parentChatId })
          })

        break // Only process first PR URL found
      }
    }
  }, [messages, isStreaming, parentChatId, utils])
}
