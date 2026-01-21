"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import { type TextSelectionSource } from "../context/text-selection-context"
import { cn } from "../../../lib/utils"

interface QuickCommentInputProps {
  selectedText: string
  source: TextSelectionSource
  rect: DOMRect
  onSubmit: (comment: string, selectedText: string, source: TextSelectionSource) => void
  onCancel: () => void
}

export function QuickCommentInput({
  selectedText,
  source,
  rect,
  onSubmit,
  onCancel,
}: QuickCommentInputProps) {
  const [comment, setComment] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-focus on mount
  useEffect(() => {
    // Small delay to ensure portal is mounted
    const timer = setTimeout(() => {
      inputRef.current?.focus()
    }, 10)
    return () => clearTimeout(timer)
  }, [])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCancel()
      }
    }

    // Add with slight delay to prevent immediate trigger from the button click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [onCancel])

  const handleSubmit = useCallback(() => {
    const trimmed = comment.trim()
    if (trimmed) {
      onSubmit(trimmed, selectedText, source)
    }
  }, [comment, selectedText, source, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      e.preventDefault()
      onCancel()
    }
  }, [handleSubmit, onCancel])

  // Calculate position - below the selection by default, above if not enough space
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const inputWidth = 320
  const inputHeight = 90

  // Center horizontally on the selection
  let left = rect.left + rect.width / 2
  left = Math.max(inputWidth / 2 + 16, Math.min(left, viewportWidth - inputWidth / 2 - 16))
  const centeredLeft = left - inputWidth / 2

  // Position below by default, above if not enough space below
  const spaceBelow = viewportHeight - rect.bottom
  const showBelow = spaceBelow > inputHeight + 8

  const top = showBelow
    ? rect.bottom + 4
    : rect.top - inputHeight - 4

  const style: React.CSSProperties = {
    position: "fixed",
    top,
    left: centeredLeft,
    width: inputWidth,
    zIndex: 100001, // Above popover
  }

  // Create preview text
  const preview = selectedText.length > 60
    ? selectedText.slice(0, 60) + "..."
    : selectedText

  // Get source label
  const sourceLabel = source.type === "diff" || source.type === "tool-edit"
    ? `${source.filePath.split("/").pop()}${source.type === "diff" && source.lineNumber ? `:${source.lineNumber}` : ""}`
    : "from chat"

  // Animation: scale from direction of selection
  const animationClass = showBelow
    ? "animate-in fade-in-0 zoom-in-95 origin-top duration-100"
    : "animate-in fade-in-0 zoom-in-95 origin-bottom duration-100"

  const content = (
    <div
      ref={containerRef}
      style={style}
      className={animationClass}
    >
      <div className="rounded-md bg-popover border border-border shadow-lg overflow-hidden">
        {/* Preview of selected text */}
        <div className="px-2.5 py-1.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-0.5">
            <span>Replying to</span>
            <span className="font-medium text-foreground/70">{sourceLabel}</span>
          </div>
          <div className="text-xs text-muted-foreground font-mono line-clamp-2">
            {preview}
          </div>
        </div>

        {/* Input area */}
        <div className="p-1.5">
          <div className="flex items-center gap-1.5">
            <input
              ref={inputRef}
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add your reply..."
              className="flex-1 text-xs bg-transparent outline-none text-foreground placeholder:text-muted-foreground px-1"
            />
            <button
              onClick={handleSubmit}
              disabled={!comment.trim()}
              className={cn(
                "shrink-0 px-2 py-0.5 text-xs font-medium rounded transition-colors",
                comment.trim()
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
