import { useState, useCallback, useRef } from "react"
import {
  type PreviewElementContext,
  createTextPreview,
} from "../lib/queue-utils"

export interface UsePreviewElementSelectionReturn {
  previewElementContexts: PreviewElementContext[]
  addPreviewElementContext: (
    html: string,
    componentName: string | null,
    filePath: string | null
  ) => void
  removePreviewElementContext: (id: string) => void
  clearPreviewElementContexts: () => void
  // Ref for accessing current value in callbacks without re-renders
  previewElementContextsRef: React.RefObject<PreviewElementContext[]>
  // Direct state setter for restoring from draft
  setPreviewElementContextsFromDraft: (contexts: PreviewElementContext[]) => void
}

export function usePreviewElementSelection(): UsePreviewElementSelectionReturn {
  const [previewElementContexts, setPreviewElementContexts] = useState<
    PreviewElementContext[]
  >([])
  const previewElementContextsRef = useRef<PreviewElementContext[]>([])

  // Keep ref in sync with state
  previewElementContextsRef.current = previewElementContexts

  const addPreviewElementContext = useCallback(
    (html: string, componentName: string | null, filePath: string | null) => {
      console.log("[usePreviewElementSelection] addPreviewElementContext called:", {
        componentName,
        filePath,
        htmlLength: html?.length,
      })
      const trimmedHtml = html.trim()
      if (!trimmedHtml) {
        console.log("[usePreviewElementSelection] Empty HTML, ignoring")
        return
      }

      // Prevent duplicates - check if same HTML already exists
      const isDuplicate = previewElementContextsRef.current.some(
        (ctx) => ctx.html === trimmedHtml
      )
      if (isDuplicate) {
        console.log("[usePreviewElementSelection] Duplicate HTML, ignoring")
        return
      }

      const newContext: PreviewElementContext = {
        id: `pec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        html: trimmedHtml,
        componentName,
        filePath,
        preview: createTextPreview(trimmedHtml),
        createdAt: new Date(),
      }

      console.log("[usePreviewElementSelection] Adding new context:", newContext.id)
      setPreviewElementContexts((prev) => [...prev, newContext])
    },
    []
  )

  const removePreviewElementContext = useCallback((id: string) => {
    setPreviewElementContexts((prev) => prev.filter((ctx) => ctx.id !== id))
  }, [])

  const clearPreviewElementContexts = useCallback(() => {
    setPreviewElementContexts([])
  }, [])

  // Direct state setter for restoring from draft
  const setPreviewElementContextsFromDraft = useCallback(
    (contexts: PreviewElementContext[]) => {
      setPreviewElementContexts(contexts)
      previewElementContextsRef.current = contexts
    },
    []
  )

  return {
    previewElementContexts,
    addPreviewElementContext,
    removePreviewElementContext,
    clearPreviewElementContexts,
    previewElementContextsRef,
    setPreviewElementContextsFromDraft,
  }
}
