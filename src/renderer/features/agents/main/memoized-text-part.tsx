"use client"

import { memo, useId } from "react"
import { cn } from "../../../lib/utils"
import { MemoizedMarkdown } from "../../../components/chat-markdown-renderer"

interface MemoizedTextPartProps {
  text: string
  messageId: string  // Added for stable block keys
  isFinalText: boolean
  visibleStepsCount: number
  isStreaming?: boolean
  onUrlClick?: (url: string) => void
}

// Only re-render when text actually changes
function areTextPropsEqual(prev: MemoizedTextPartProps, next: MemoizedTextPartProps): boolean {
  return (
    prev.text === next.text &&
    prev.messageId === next.messageId &&
    prev.isFinalText === next.isFinalText &&
    prev.visibleStepsCount === next.visibleStepsCount &&
    prev.isStreaming === next.isStreaming &&
    prev.onUrlClick === next.onUrlClick
  )
}

export const MemoizedTextPart = memo(function MemoizedTextPart({
  text,
  messageId,
  isFinalText,
  visibleStepsCount,
  isStreaming = false,
  onUrlClick,
}: MemoizedTextPartProps) {
  if (!text?.trim()) return null

  return (
    <div
      className={cn(
        "text-foreground px-2",
        isFinalText && visibleStepsCount > 0 && "pt-3 border-t border-border/50",
      )}
    >
      {isFinalText && visibleStepsCount > 0 && (
        <div className="text-[12px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1">
          Response
        </div>
      )}
      <MemoizedMarkdown content={text} id={messageId} size="sm" onUrlClick={onUrlClick} />
    </div>
  )
}, areTextPropsEqual)
