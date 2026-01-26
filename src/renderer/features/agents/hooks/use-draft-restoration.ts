import { useEffect, useRef } from "react"
import { getSubChatDraftFull } from "../lib/drafts"
import type { AgentsMentionsEditorHandle } from "../ui/agents-mentions-editor"

/**
 * Custom hook to handle draft restoration when switching between sub-chats
 * Restores text, images, files, and text contexts from localStorage
 */
export function useDraftRestoration({
  editorRef,
  parentChatId,
  subChatId,
  setImagesFromDraft,
  setFilesFromDraft,
  setTextContextsFromDraft,
  clearAll,
  clearTextContexts,
}: {
  editorRef: React.RefObject<AgentsMentionsEditorHandle | null>
  parentChatId: string | undefined
  subChatId: string
  setImagesFromDraft: (images: any[]) => void
  setFilesFromDraft: (files: any[]) => void
  setTextContextsFromDraft: (contexts: any[]) => void
  clearAll: () => void
  clearTextContexts: () => void
}) {
  // Track previous sub-chat ID to detect switches
  const prevSubChatIdForDraftRef = useRef<string | null>(null)

  useEffect(() => {
    // Restore full draft (text + attachments + text contexts) for new sub-chat
    const savedDraft = parentChatId
      ? getSubChatDraftFull(parentChatId, subChatId)
      : null

    if (savedDraft) {
      // Restore text
      if (savedDraft.text) {
        editorRef.current?.setValue(savedDraft.text)
      } else {
        editorRef.current?.clear()
      }
      // Restore images
      if (savedDraft.images.length > 0) {
        setImagesFromDraft(savedDraft.images)
      } else {
        clearAll()
      }
      // Restore files
      if (savedDraft.files.length > 0) {
        setFilesFromDraft(savedDraft.files)
      }
      // Restore text contexts
      if (savedDraft.textContexts.length > 0) {
        setTextContextsFromDraft(savedDraft.textContexts)
      } else {
        clearTextContexts()
      }
    } else if (
      prevSubChatIdForDraftRef.current &&
      prevSubChatIdForDraftRef.current !== subChatId
    ) {
      // Clear everything when switching to a sub-chat with no draft
      editorRef.current?.clear()
      clearAll()
      clearTextContexts()
    }

    prevSubChatIdForDraftRef.current = subChatId
  }, [
    subChatId,
    parentChatId,
    editorRef,
    setImagesFromDraft,
    setFilesFromDraft,
    setTextContextsFromDraft,
    clearAll,
    clearTextContexts,
  ])
}
