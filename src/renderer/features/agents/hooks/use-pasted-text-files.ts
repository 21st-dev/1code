import { useState, useCallback, useRef } from "react"
import { trpc } from "../../../lib/trpc"

export interface PastedTextFile {
  id: string
  filePath: string
  filename: string
  size: number
  preview: string
  createdAt: Date
  kind?: "pasted" | "chatHistory"
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

  const writePastedTextMutation = trpc.files.writePastedText.useMutation()
  const writePastedTextMutationRef = useRef(writePastedTextMutation)
  writePastedTextMutationRef.current = writePastedTextMutation

  const addPastedText = useCallback(
    async (text: string) => {
      try {
        const result = await writePastedTextMutationRef.current.mutateAsync({
          subChatId,
          text,
        })

        // Create preview from first 50 chars, replace newlines with spaces
        const preview = text.slice(0, 50).replace(/\n/g, " ")
        const newPasted: PastedTextFile = {
          id: `pasted_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          filePath: result.filePath,
          filename: result.filename,
          size: result.size,
          preview: preview.length < text.length ? `${preview}...` : preview,
          createdAt: new Date(),
        }

        setPastedTexts((prev) => [...prev, newPasted])
      } catch (error) {
        console.error("[usePastedTextFiles] Failed to write:", error)
      }
    },
    [subChatId]
  )

  const removePastedText = useCallback((id: string) => {
    setPastedTexts((prev) => prev.filter((p) => p.id !== id))
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
