/**
 * MarkdownView Component
 *
 * Renders markdown content for SpecKit artifacts (spec, plan, tasks, constitution).
 * Wraps the existing ChatMarkdownRenderer with memoization for performance.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo } from "react"
import { ChatMarkdownRenderer } from "@/components/chat-markdown-renderer"
import { cn } from "@/lib/utils"

interface MarkdownViewProps {
  /** Markdown content to render */
  content: string
  /** Size variant: sm for compact, md for normal, lg for fullscreen */
  size?: "sm" | "md" | "lg"
  /** Additional CSS classes */
  className?: string
  /** Whether content is being streamed (disables certain optimizations) */
  isStreaming?: boolean
}

/**
 * MarkdownView - Renders markdown content for SpecKit
 *
 * Uses the existing ChatMarkdownRenderer with additional memoization
 * to prevent unnecessary re-renders when viewing artifacts.
 */
export const MarkdownView = memo(function MarkdownView({
  content,
  size = "md",
  className,
  isStreaming = false,
}: MarkdownViewProps) {
  if (!content) {
    return (
      <div className={cn("text-muted-foreground text-sm italic", className)}>
        No content available
      </div>
    )
  }

  return (
    <div className={cn("allow-text-selection", className)}>
      <ChatMarkdownRenderer
        content={content}
        size={size}
        isStreaming={isStreaming}
      />
    </div>
  )
})

MarkdownView.displayName = "MarkdownView"
