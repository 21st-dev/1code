"use client"

import { useEffect, useCallback, useState, useRef } from "react"
import { createPortal } from "react-dom"
import { useTextSelection, type TextSelectionSource } from "../context/text-selection-context"

interface TextSelectionPopoverProps {
  onAddToContext: (text: string, source: TextSelectionSource) => void
  onQuickComment?: (text: string, source: TextSelectionSource, rect: DOMRect) => void
  onFocusInput?: () => void
}

export function TextSelectionPopover({
  onAddToContext,
  onQuickComment,
  onFocusInput,
}: TextSelectionPopoverProps) {
  const { selectedText, source, selectionRect, clearSelection } =
    useTextSelection()
  const [isVisible, setIsVisible] = useState(false)
  const [isMouseDown, setIsMouseDown] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const handleAddToContext = useCallback(() => {
    if (selectedText && source) {
      onAddToContext(selectedText, source)
      clearSelection()
      setIsVisible(false)
      // Focus the chat input after adding to context
      requestAnimationFrame(() => {
        onFocusInput?.()
      })
    }
  }, [selectedText, source, onAddToContext, clearSelection, onFocusInput])

  const handleQuickComment = useCallback(() => {
    if (selectedText && source && selectionRect && onQuickComment) {
      onQuickComment(selectedText, source, selectionRect)
      setIsVisible(false)
      // Don't clear selection - QuickCommentInput will handle it after submit
    }
  }, [selectedText, source, selectionRect, onQuickComment])

  // Track mouse down/up to know when selection is complete
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Ignore clicks on the popover itself
      if (popoverRef.current?.contains(e.target as Node)) {
        return
      }
      setIsMouseDown(true)
      setIsVisible(false) // Hide while selecting
    }

    const handleMouseUp = (e: MouseEvent) => {
      // Ignore clicks on the popover itself
      if (popoverRef.current?.contains(e.target as Node)) {
        return
      }
      setIsMouseDown(false)
    }

    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("mouseup", handleMouseUp)
    }
  }, [])

  // Show popover only when mouse is up and we have a valid selection
  useEffect(() => {
    if (!isMouseDown && selectedText && source && selectionRect) {
      setIsVisible(true)
    } else if (!selectedText || !source || !selectionRect) {
      setIsVisible(false)
    }
  }, [isMouseDown, selectedText, source, selectionRect])

  // Don't render if not visible
  if (!isVisible || !selectedText || !source || !selectionRect) {
    return null
  }

  // Calculate position - above the selection by default, below if not enough space
  const viewportWidth = window.innerWidth
  const popoverWidth = 120
  const popoverHeight = 28
  let left = selectionRect.left + selectionRect.width / 2

  // Clamp left position to prevent overflow
  left = Math.max(popoverWidth / 2 + 8, Math.min(left, viewportWidth - popoverWidth / 2 - 8))

  // Calculate actual left position accounting for centering
  const popoverWidthEstimate = onQuickComment && (source.type === "diff" || source.type === "tool-edit") ? 160 : 100
  const centeredLeft = left - popoverWidthEstimate / 2

  // Position above by default, below if not enough space above
  const spaceAbove = selectionRect.top
  const showAbove = spaceAbove > popoverHeight + 8

  const top = showAbove
    ? selectionRect.top - popoverHeight - 4
    : selectionRect.bottom + 4

  const style: React.CSSProperties = {
    position: "fixed",
    top,
    left: centeredLeft,
    zIndex: 100000,
  }

  // Animation: scale from direction of selection
  const animationClass = showAbove
    ? "animate-in fade-in-0 zoom-in-95 origin-bottom duration-100"
    : "animate-in fade-in-0 zoom-in-95 origin-top duration-100"

  const popoverContent = (
    <div
      ref={popoverRef}
      style={style}
      className={animationClass}
    >
      <div className="flex items-center gap-0.5 rounded-md border border-border bg-popover px-0.5 py-0.5 shadow-lg">
        <button
          onClick={handleAddToContext}
          className="rounded px-1.5 py-0.5 text-xs text-popover-foreground hover:bg-white/15 transition-colors duration-100 active:scale-[0.97]"
        >
          Add to context
        </button>
        {/* Quick comment button shows for diff and tool-edit selections */}
        {onQuickComment && (source.type === "diff" || source.type === "tool-edit") && (
          <>
            <div className="w-px h-3 bg-border" />
            <button
              onClick={handleQuickComment}
              className="rounded px-1.5 py-0.5 text-xs text-popover-foreground hover:bg-white/15 transition-colors duration-100 active:scale-[0.97]"
            >
              Reply
            </button>
          </>
        )}
      </div>
    </div>
  )

  return createPortal(popoverContent, document.body)
}
