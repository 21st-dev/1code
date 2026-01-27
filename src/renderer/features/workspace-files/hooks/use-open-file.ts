import { useCallback } from "react"
import { useSetAtom, useAtomValue } from "jotai"
import { activeDocumentAtomFamily, documentsPanelOpenAtomFamily } from "../../../lib/atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { useAgentSubChatStore } from "../../../lib/stores/sub-chat-store"
import { getFileType } from "../utils/file-types"
import { trpcClient } from "../../../lib/trpc"

export function useOpenFile() {
  // Get effective chat ID
  const parentChatId = useAgentSubChatStore((state) => state.chatId)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const effectiveChatId = parentChatId || selectedChatId || ""

  // Set up atom writers
  const setActiveDoc = useSetAtom(activeDocumentAtomFamily(effectiveChatId))
  const setDocumentsOpen = useSetAtom(documentsPanelOpenAtomFamily(effectiveChatId))

  const openFile = useCallback(
    async (filePath: string, fileName?: string) => {
      if (!effectiveChatId) {
        console.error("[useOpenFile] No chat context available")
        return
      }

      try {
        console.log("[useOpenFile] Opening file:", {
          filePath,
          chatId: effectiveChatId,
        })

        // Backend now handles both absolute and project-relative paths
        const result = await trpcClient.workspaceFiles.readFile.query({
          chatId: effectiveChatId,
          filePath: filePath,
        })

        const type = getFileType(fileName || filePath)

        setActiveDoc({
          path: filePath,
          content: result.content,
          type,
        })

        setDocumentsOpen(true)
      } catch (error) {
        console.error("[useOpenFile] Failed to open file:", filePath, error)
        // TODO: Show user-friendly error toast
      }
    },
    [effectiveChatId, setActiveDoc, setDocumentsOpen]
  )

  return { openFile, effectiveChatId }
}
