import { useState, useCallback, useRef } from "react"
import {
  type SelectedTextContext,
  type DiffTextContext,
  createTextPreview,
} from "../lib/queue-utils"

export interface UseTextContextSelectionReturn {
  textContexts: SelectedTextContext[]
  diffTextContexts: DiffTextContext[]
  addTextContext: (text: string, sourceMessageId: string) => void
  addDiffTextContext: (text: string, filePath: string, lineNumber?: number, lineType?: "old" | "new") => void
  removeTextContext: (id: string) => void
  removeDiffTextContext: (id: string) => void
  clearTextContexts: () => void
  clearDiffTextContexts: () => void
  // Ref for accessing current value in callbacks without re-renders
  textContextsRef: React.RefObject<SelectedTextContext[]>
  diffTextContextsRef: React.RefObject<DiffTextContext[]>
  // Direct state setter for restoring from draft
  setTextContextsFromDraft: (contexts: SelectedTextContext[]) => void
  setDiffTextContextsFromDraft: (contexts: DiffTextContext[]) => void
}

export function useTextContextSelection(): UseTextContextSelectionReturn {
  const [textContexts, setTextContexts] = useState<SelectedTextContext[]>([])
  const [diffTextContexts, setDiffTextContexts] = useState<DiffTextContext[]>([])
  const textContextsRef = useRef<SelectedTextContext[]>([])
  const diffTextContextsRef = useRef<DiffTextContext[]>([])

  // Keep refs in sync with state
  textContextsRef.current = textContexts
  diffTextContextsRef.current = diffTextContexts

  const addTextContext = useCallback(
    (text: string, sourceMessageId: string) => {
      const trimmedText = text.trim()
      if (!trimmedText) return

      // Prevent duplicates - check if same text from same message already exists
      const isDuplicate = textContextsRef.current.some(
        (ctx) =>
          ctx.text === trimmedText && ctx.sourceMessageId === sourceMessageId
      )
      if (isDuplicate) return

      const newContext: SelectedTextContext = {
        id: `tc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        text: trimmedText,
        sourceMessageId,
        preview: createTextPreview(trimmedText),
        createdAt: new Date(),
      }

      setTextContexts((prev) => [...prev, newContext])
    },
    []
  )

  const addDiffTextContext = useCallback(
    (text: string, filePath: string, lineNumber?: number, lineType?: "old" | "new") => {
      const trimmedText = text.trim()
      if (!trimmedText) return

      // Prevent duplicates
      const isDuplicate = diffTextContextsRef.current.some(
        (ctx) =>
          ctx.text === trimmedText && ctx.filePath === filePath
      )
      if (isDuplicate) return

      const newContext: DiffTextContext = {
        id: `dtc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        text: trimmedText,
        filePath,
        lineNumber,
        lineType,
        preview: createTextPreview(trimmedText),
        createdAt: new Date(),
      }

      setDiffTextContexts((prev) => [...prev, newContext])
    },
    []
  )

  const removeTextContext = useCallback((id: string) => {
    setTextContexts((prev) => prev.filter((ctx) => ctx.id !== id))
  }, [])

  const removeDiffTextContext = useCallback((id: string) => {
    setDiffTextContexts((prev) => prev.filter((ctx) => ctx.id !== id))
  }, [])

  const clearTextContexts = useCallback(() => {
    setTextContexts([])
  }, [])

  const clearDiffTextContexts = useCallback(() => {
    setDiffTextContexts([])
  }, [])

  // Direct state setter for restoring from draft
  const setTextContextsFromDraft = useCallback(
    (contexts: SelectedTextContext[]) => {
      setTextContexts(contexts)
      textContextsRef.current = contexts
    },
    []
  )

  const setDiffTextContextsFromDraft = useCallback(
    (contexts: DiffTextContext[]) => {
      setDiffTextContexts(contexts)
      diffTextContextsRef.current = contexts
    },
    []
  )

  return {
    textContexts,
    diffTextContexts,
    addTextContext,
    addDiffTextContext,
    removeTextContext,
    removeDiffTextContext,
    clearTextContexts,
    clearDiffTextContexts,
    textContextsRef,
    diffTextContextsRef,
    setTextContextsFromDraft,
    setDiffTextContextsFromDraft,
  }
}
