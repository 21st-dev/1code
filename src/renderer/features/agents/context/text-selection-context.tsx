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

// Chromium 137+ Selection API extension for Shadow DOM support
declare global {
  interface Selection {
    getComposedRanges?(options: { shadowRoots: ShadowRoot[] }): StaticRange[]
  }
}

// Discriminated union for selection source
export type TextSelectionSource =
  | { type: "assistant-message"; messageId: string }
  | { type: "diff"; filePath: string; lineNumber?: number; lineType?: "old" | "new" }
  | { type: "tool-edit"; filePath: string; isWrite: boolean }
  | { type: "plan"; planPath: string }
  | { type: "file-viewer"; filePath: string }

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

// Collect all open shadow roots from diffs-container elements
function getDiffShadowRoots(): ShadowRoot[] {
  const roots: ShadowRoot[] = []
  document.querySelectorAll("diffs-container").forEach((el) => {
    const sr = (el as HTMLElement).shadowRoot
    if (sr) roots.push(sr)
  })
  return roots
}

/**
 * Convert a StaticRange to a live Range (needed for toString() and getBoundingClientRect()).
 * StaticRange from getComposedRanges doesn't have these methods.
 */
function toLiveRange(staticRange: StaticRange): Range | null {
  try {
    const range = document.createRange()
    range.setStart(staticRange.startContainer, staticRange.startOffset)
    range.setEnd(staticRange.endContainer, staticRange.endOffset)
    return range
  } catch {
    return null
  }
}

/**
 * Get the selection range that works across Shadow DOM boundaries.
 * Uses getComposedRanges (Chromium 137+) to resolve nodes inside shadow trees.
 * Falls back to getRangeAt(0) for non-shadow selections.
 *
 * Returns the resolved range, the element at the start, and the extracted text.
 * We extract text here because selection.toString() may be empty/incorrect
 * for selections inside Shadow DOM.
 */
function getSelectionRange(selection: Selection): { range: Range; element: Element | null; text: string } | null {
  // Try getComposedRanges first — works across Shadow DOM (Chromium 137+)
  if (typeof selection.getComposedRanges === "function") {
    const shadowRoots = getDiffShadowRoots()
    try {
      const ranges = selection.getComposedRanges({ shadowRoots })
      if (ranges.length > 0) {
        const staticRange = ranges[0]!
        if (staticRange.startContainer === staticRange.endContainer && staticRange.startOffset === staticRange.endOffset) {
          return null
        }
        const liveRange = toLiveRange(staticRange)
        if (!liveRange) return null

        const container = staticRange.startContainer
        const element = container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : (container as Element)
        const text = liveRange.toString()
        return { range: liveRange, element, text }
      }
    } catch {
      // Fall through to legacy path
    }
  }

  // Legacy path — works for light DOM selections
  if (selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const element = container.nodeType === Node.TEXT_NODE
    ? container.parentElement
    : (container as Element)
  const text = selection.toString()
  return { range, element, text }
}

// Helper to extract line number from diff selection
// @pierre/diffs uses data-line and data-line-type attributes on line rows
function extractDiffLineInfo(element: Element): { lineNumber?: number; lineType?: "old" | "new" } {
  const lineRow = element.closest?.("[data-line]") as HTMLElement | null
  if (!lineRow) return {}

  const lineNum = lineRow.getAttribute("data-line")
  const lineType = lineRow.getAttribute("data-line-type")

  let lineNumber: number | undefined
  let type: "old" | "new" | undefined

  if (lineNum) {
    lineNumber = parseInt(lineNum, 10)
  }

  if (lineType) {
    if (lineType === "change-deletion") {
      type = "old"
    } else if (lineType === "change-addition") {
      type = "new"
    } else {
      type = "new"
    }
  }

  return { lineNumber, lineType: type }
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
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }

      rafId = requestAnimationFrame(() => {
        rafId = null

        const selection = window.getSelection()
        if (!selection) {
          setState({ selectedText: null, source: null, selectionRect: null })
          return
        }

        // Get selection range — works across Shadow DOM via getComposedRanges
        // We get text from the range directly, not selection.toString(),
        // because selection.toString() may be empty for Shadow DOM selections
        const result = getSelectionRange(selection)
        if (!result) {
          setState({ selectedText: null, source: null, selectionRect: null })
          return
        }

        const { range, element, text: rawText } = result
        const text = rawText.trim()
        if (!text) {
          setState({ selectedText: null, source: null, selectionRect: null })
          return
        }

        // --- Resolve source ---
        let source: TextSelectionSource | null = null

        if (element) {
          // Check for file viewer content
          const fileViewerElement = element.closest?.(
            "[data-file-viewer-path]"
          ) as HTMLElement | null

          // Check for plan sidebar content
          const planElement = element.closest?.(
            "[data-plan-path]"
          ) as HTMLElement | null

          // Check for assistant message
          const messageElement = element.closest?.(
            "[data-assistant-message-id]"
          ) as HTMLElement | null

          // Check for tool-edit (Edit/Write tool in chat)
          const toolEditElement = element.closest?.(
            '[data-part-type="tool-Edit"], [data-part-type="tool-Write"]'
          ) as HTMLElement | null

          // Check for diff — element may be inside Shadow DOM of diffs-container
          // With getComposedRanges, element is the actual node inside the shadow tree
          // Walk up through shadow boundaries to find [data-diff-file-path]
          const diffCard = (() => {
            let node: Node | null = element
            while (node) {
              if (node instanceof HTMLElement) {
                const card = node.closest("[data-diff-file-path]")
                if (card) return card as HTMLElement
              }
              // Cross shadow boundary
              const root = node.getRootNode()
              if (root instanceof ShadowRoot) {
                node = root.host
                continue
              }
              break
            }
            return null
          })()

          // Priority: file-viewer > plan > tool-edit > diff > assistant-message
          if (fileViewerElement) {
            const filePath = fileViewerElement.getAttribute("data-file-viewer-path") || "unknown"
            source = { type: "file-viewer", filePath }
          }

          if (!source && planElement) {
            const planPath = planElement.getAttribute("data-plan-path") || "unknown"
            source = { type: "plan", planPath }
          }

          if (!source && toolEditElement) {
            const partType = toolEditElement.getAttribute("data-part-type")
            const isWrite = partType === "tool-Write"
            const filePath = toolEditElement.getAttribute("data-tool-file-path") || "unknown"
            source = { type: "tool-edit", filePath, isWrite }
          }

          if (!source && diffCard) {
            const filePath = diffCard.getAttribute("data-diff-file-path")
            if (filePath) {
              const lineInfo = extractDiffLineInfo(element)
              source = {
                type: "diff",
                filePath,
                lineNumber: lineInfo.lineNumber,
                lineType: lineInfo.lineType,
              }
            }
          }

          if (!source && messageElement) {
            const messageId = messageElement.getAttribute("data-assistant-message-id")
            if (messageId) {
              source = { type: "assistant-message", messageId }
            }
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

    // Listen for Monaco editor selection changes (Monaco doesn't fire native selectionchange)
    const handleMonacoSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        text: string | null
        source: TextSelectionSource | null
        rect: DOMRect | null
      }
      if (!detail.text) {
        setState({ selectedText: null, source: null, selectionRect: null })
      } else {
        setState({
          selectedText: detail.text,
          source: detail.source,
          selectionRect: detail.rect,
        })
      }
    }

    window.addEventListener("monaco-selection-change", handleMonacoSelection)

    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange)
      window.removeEventListener("monaco-selection-change", handleMonacoSelection)
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
