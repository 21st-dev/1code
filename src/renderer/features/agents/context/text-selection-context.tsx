"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react"

// Discriminated union for selection source
export type TextSelectionSource =
  | { type: "assistant-message"; messageId: string }
  | { type: "diff"; filePath: string; lineNumber?: number; lineType?: "old" | "new" }
  | { type: "tool-edit"; filePath: string; isWrite: boolean }

export interface TextSelectionState {
  selectedText: string | null
  source: TextSelectionSource | null
  selectionRect: DOMRect | null
}

interface TextSelectionContextValue extends TextSelectionState {
  clearSelection: () => void
  // Legacy getters for backwards compatibility
  selectedMessageId: string | null
}

const TextSelectionContext = createContext<TextSelectionContextValue | null>(
  null
)

export function useTextSelection(): TextSelectionContextValue {
  const ctx = useContext(TextSelectionContext)
  if (!ctx) {
    throw new Error(
      "useTextSelection must be used within TextSelectionProvider"
    )
  }
  return ctx
}

interface TextSelectionProviderProps {
  children: ReactNode
}

// Helper to extract line number from diff selection
function extractDiffLineInfo(element: Element): { lineNumber?: number; lineType?: "old" | "new" } {
  // Find the closest table row (tr) which contains line number info
  const row = element.closest("tr")
  if (!row) return {}

  // @git-diff-view/react uses data attributes on line number cells
  // Try to find line numbers from the row
  const oldLineNumCell = row.querySelector("[data-line-num-old]")
  const newLineNumCell = row.querySelector("[data-line-num-new]")

  // Also check for class-based selectors as fallback
  const lineNumCells = row.querySelectorAll(".diff-line-num")

  let lineNumber: number | undefined
  let lineType: "old" | "new" | undefined

  // Prefer new line number if available
  if (newLineNumCell) {
    const numAttr = newLineNumCell.getAttribute("data-line-num-new")
    if (numAttr) {
      lineNumber = parseInt(numAttr, 10)
      lineType = "new"
    }
  }

  // Fall back to old line number
  if (!lineNumber && oldLineNumCell) {
    const numAttr = oldLineNumCell.getAttribute("data-line-num-old")
    if (numAttr) {
      lineNumber = parseInt(numAttr, 10)
      lineType = "old"
    }
  }

  // Try text content of line number cells as last resort
  if (!lineNumber && lineNumCells.length > 0) {
    for (let i = 0; i < lineNumCells.length; i++) {
      const cell = lineNumCells[i]
      const text = cell?.textContent?.trim()
      if (text && /^\d+$/.test(text)) {
        lineNumber = parseInt(text, 10)
        // Determine type based on cell class or position
        lineType = cell?.classList.contains("diff-line-old-num") ? "old" : "new"
        break
      }
    }
  }

  return { lineNumber, lineType }
}

export function TextSelectionProvider({
  children,
}: TextSelectionProviderProps) {
  const [state, setState] = useState<TextSelectionState>({
    selectedText: null,
    source: null,
    selectionRect: null,
  })

  const clearSelection = useCallback(() => {
    window.getSelection()?.removeAllRanges()
    setState({
      selectedText: null,
      source: null,
      selectionRect: null,
    })
  }, [])

  useEffect(() => {
    let rafId: number | null = null

    const handleSelectionChange = () => {
      // Cancel any pending frame to debounce rapid selection changes
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        rafId = null

        const selection = window.getSelection()

        // No selection or collapsed (just cursor)
        if (!selection || selection.isCollapsed) {
          setState({
            selectedText: null,
            source: null,
            selectionRect: null,
          })
          return
        }

        const text = selection.toString().trim()
        if (!text) {
          setState({
            selectedText: null,
            source: null,
            selectionRect: null,
          })
          return
        }

        // Get the selection range
        const range = selection.getRangeAt(0)
        const container = range.commonAncestorContainer

        // Find the element containing the selection
        const element =
          container.nodeType === Node.TEXT_NODE
            ? container.parentElement
            : (container as Element)

        // Check for assistant message first
        // Must be inside [data-assistant-message-id] element
        const messageElement = element?.closest?.(
          "[data-assistant-message-id]"
        ) as HTMLElement | null

        // Check for tool-edit (Edit/Write tool in chat)
        // Use specific selector for Edit/Write tools only
        const toolEditElement = element?.closest?.(
          '[data-part-type="tool-Edit"], [data-part-type="tool-Write"]'
        ) as HTMLElement | null

        // Check for diff file - must be inside .agent-diff-wrapper (the actual code area)
        // This prevents selection in diff headers, buttons, etc.
        const diffWrapperElement = element?.closest?.(".agent-diff-wrapper") as HTMLElement | null
        const diffElement = diffWrapperElement?.closest?.(
          "[data-diff-file-path]"
        ) as HTMLElement | null

        // Build the source based on what we found
        // Priority: tool-edit > diff > assistant-message (tool-edit is nested inside assistant-message)
        let source: TextSelectionSource | null = null

        if (toolEditElement) {
          // Tool edit selection - extract file path from data attribute
          const partType = toolEditElement.getAttribute("data-part-type")
          const isWrite = partType === "tool-Write"
          const filePath = toolEditElement.getAttribute("data-tool-file-path") || "unknown"
          source = {
            type: "tool-edit",
            filePath,
            isWrite,
          }
        }

        if (!source && diffElement && diffWrapperElement) {
          // Only allow diff selection if inside the actual diff content wrapper
          const filePath = diffElement.getAttribute("data-diff-file-path")
          if (filePath) {
            const lineInfo = element ? extractDiffLineInfo(element) : {}
            source = {
              type: "diff",
              filePath,
              lineNumber: lineInfo.lineNumber,
              lineType: lineInfo.lineType,
            }
          }
        }

        // Fallback to assistant message (check last because tool-edit is nested inside)
        if (!source && messageElement) {
          const messageId = messageElement.getAttribute("data-assistant-message-id")
          if (messageId) {
            source = { type: "assistant-message", messageId }
          }
        }

        // Selection is not within a supported element
        if (!source) {
          setState({
            selectedText: null,
            source: null,
            selectionRect: null,
          })
          return
        }

        // Get the bounding rect of the selection
        const rect = range.getBoundingClientRect()

        setState({
          selectedText: text,
          source,
          selectionRect: rect,
        })
      })
    }

    document.addEventListener("selectionchange", handleSelectionChange)

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  // Compute legacy selectedMessageId for backwards compatibility
  const selectedMessageId = state.source?.type === "assistant-message"
    ? state.source.messageId
    : null

  // Memoize context value to prevent unnecessary re-renders of consumers
  const contextValue = useMemo<TextSelectionContextValue>(() => ({
    ...state,
    clearSelection,
    selectedMessageId,
  }), [state, clearSelection, selectedMessageId])

  return (
    <TextSelectionContext.Provider value={contextValue}>
      {children}
    </TextSelectionContext.Provider>
  )
}
