import { useCallback } from "react"
import { useSetAtom, useAtomValue } from "jotai"
import { activeDocumentAtomFamily, documentsPanelOpenAtomFamily } from "../../../lib/atoms"
import { selectedAgentChatIdAtom } from "../../agents/atoms"
import { useAgentSubChatStore } from "../../../lib/stores/sub-chat-store"
import { getFileType } from "../utils/file-types"
import { trpc } from "../../../lib/trpc"

export function useOpenFile() {
  // Get effective chat ID
  const parentChatId = useAgentSubChatStore((state) => state.chatId)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)
  const effectiveChatId = parentChatId || selectedChatId || ""

  // Set up atom writers
  const setActiveDoc = useSetAtom(activeDocumentAtomFamily(effectiveChatId))
  const setDocumentsOpen = useSetAtom(documentsPanelOpenAtomFamily(effectiveChatId))

  // Get tRPC utilities
  const utils = trpc.useUtils()

  const openFile = useCallback(
    async (filePath: string, fileName?: string) => {
      if (!effectiveChatId) {
        console.error("[useOpenFile] No chat context available")
        return
      }

      try {
        // Read file content from workspace
        const result = await utils.workspaceFiles.readFile.fetch({
          chatId: effectiveChatId,
          filePath,
        })

        // Determine file type for rendering
        const type = getFileType(fileName || filePath)

        // Update active document
        setActiveDoc({
          path: filePath,
          content: result.content,
          type,
        })

        // Show documents panel
        setDocumentsOpen(true)
      } catch (error) {
        console.error("[useOpenFile] Failed to open file:", error)
        // TODO: Show error toast notification
      }
    },
    [effectiveChatId, setActiveDoc, setDocumentsOpen, utils]
  )

  return { openFile, effectiveChatId }
}
