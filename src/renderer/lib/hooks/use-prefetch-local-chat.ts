import { useCallback } from "react"
import { trpc } from "../trpc"

export function usePrefetchLocalChat() {
  const utils = trpc.useUtils()

  return useCallback(
    (chatId: string) => {
      utils.chats.get.prefetch({ id: chatId }, { staleTime: 5000 })
    },
    [utils]
  )
}
