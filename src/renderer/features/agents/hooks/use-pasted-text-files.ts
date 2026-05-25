import { useState, useCallback, useRef } from "react"
import { toast } from "sonner"
import { trpc } from "../../../lib/trpc"
import {
  LONG_TEXT_ATTACHMENT_REF_PREFIX,
  type LongTextAttachment,
} from "../../../../shared/long-text-attachments"

export type PastedTextFile = LongTextAttachment & {
  filePath: string
  size: number
  createdAt: Date
}

export interface UsePastedTextFilesReturn {
  pastedTexts: PastedTextFile[]
  addPastedText: (text: string) => Promise<void>
  addChatHistoryFile: (file: PastedTextFile) => void
  removePastedText: (id: string) => void
  clearPastedTexts: () => void
  pastedTextsRef: React.RefObject<PastedTextFile[]>
  setPastedTextsFromDraft: (texts: PastedTextFile[]) => void
}

export function usePastedTextFiles(subChatId: string): UsePastedTextFilesReturn {
  const [pastedTexts, setPastedTexts] = useState<PastedTextFile[]>([])
  const pastedTextsRef = useRef<PastedTextFile[]>([])

  // Keep ref in sync with state
  pastedTextsRef.current = pastedTexts

  const stageLongTextAttachmentMutation = trpc.files.stageLongTextAttachment.useMutation()
  const stageLongTextAttachmentMutationRef = useRef(stageLongTextAttachmentMutation)
  stageLongTextAttachmentMutationRef.current = stageLongTextAttachmentMutation
  const deleteLongTextAttachmentMutation = trpc.files.deleteLongTextAttachment.useMutation()
  const deleteLongTextAttachmentMutationRef = useRef(deleteLongTextAttachmentMutation)
  deleteLongTextAttachmentMutationRef.current = deleteLongTextAttachmentMutation

  const addPastedText = useCallback(
    async (text: string) => {
      try {
        const result = await stageLongTextAttachmentMutationRef.current.mutateAsync({
          subChatId,
          text,
          kind: "pasted",
        })

        const newPasted: PastedTextFile = {
          id: result.id,
          localRef: result.localRef,
          filePath: result.filePath,
          filename: result.filename,
          byteLength: result.byteLength,
          size: result.byteLength,
          preview: result.preview,
          createdAt: new Date(),
          kind: "pasted",
        }

        setPastedTexts((prev) => [...prev, newPasted])
      } catch (error) {
        console.error("[usePastedTextFiles] Failed to write:", error)
        toast.error("Could not attach pasted text", {
          description:
            error instanceof Error
              ? error.message
              : "The pasted text could not be staged.",
        })
      }
    },
    [subChatId]
  )

  const removePastedText = useCallback((id: string) => {
    setPastedTexts((prev) => {
      const removed = prev.find((p) => p.id === id)
      if (
        typeof removed?.localRef === "string" &&
        removed.localRef.startsWith(LONG_TEXT_ATTACHMENT_REF_PREFIX)
      ) {
        void deleteLongTextAttachmentMutationRef.current
          .mutateAsync({ localRef: removed.localRef })
          .catch((error) => {
            console.warn("[usePastedTextFiles] Failed to delete:", error)
          })
      }
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const clearPastedTexts = useCallback(() => {
    setPastedTexts([])
  }, [])

  // Add a pre-built chat history file directly
  const addChatHistoryFile = useCallback((file: PastedTextFile) => {
    setPastedTexts((prev) => [...prev, file])
  }, [])

  // Direct state setter for restoring from draft/rollback
  const setPastedTextsFromDraft = useCallback((texts: PastedTextFile[]) => {
    setPastedTexts(texts)
    pastedTextsRef.current = texts
  }, [])

  return {
    pastedTexts,
    addPastedText,
    addChatHistoryFile,
    removePastedText,
    clearPastedTexts,
    pastedTextsRef,
    setPastedTextsFromDraft,
  }
}
