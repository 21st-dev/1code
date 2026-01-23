"use client"

import { memo } from "react"
import { X } from "lucide-react"
import { Button } from "../../../components/ui/button"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { cn } from "../../../lib/utils"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { ArtifactIcon } from "../../../components/ui/icons"

interface ArtifactSidebarProps {
  /** The markdown content to render */
  content: string | null
  /** Whether the content is currently streaming */
  isStreaming?: boolean
  /** Callback when close button is clicked */
  onClose: () => void
  /** Optional title for the artifact */
  title?: string
}

export const ArtifactSidebar = memo(function ArtifactSidebar({
  content,
  isStreaming = false,
  onClose,
  title = "Plan",
}: ArtifactSidebarProps) {
  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <ArtifactIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {isStreaming ? <TextShimmer>{title}</TextShimmer> : title}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 p-0 hover:bg-foreground/10"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 overflow-y-auto px-4 py-4",
          // Add subtle visual feedback during streaming
          isStreaming && "animate-pulse-subtle"
        )}
      >
        {content ? (
          <ChatMarkdownRenderer
            content={content}
            size="sm"
            isStreaming={isStreaming}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
})

const EmptyState = memo(function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12 px-4">
      <ArtifactIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
      <p className="text-sm text-muted-foreground">
        No artifact yet
      </p>
      <p className="text-xs text-muted-foreground/70 mt-1">
        Plans and generated content will appear here
      </p>
    </div>
  )
})
