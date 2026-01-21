"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"

interface ThinkingToolPart {
  type: string
  state: string
  input?: {
    text?: string
  }
  output?: {
    completed?: boolean
  }
}

interface AgentThinkingToolProps {
  part: ThinkingToolPart
  chatStatus?: string
}

// Constants for thinking preview and scrolling
const PREVIEW_LENGTH = 60
const SCROLL_THRESHOLD = 500

export const AgentThinkingTool = memo(function AgentThinkingTool({
  part,
  chatStatus,
}: AgentThinkingToolProps) {
  const isPending =
    part.state !== "output-available" && part.state !== "output-error"
  // Include "submitted" status - this is when request was sent but streaming hasn't started yet
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isStreaming = isPending && isActivelyStreaming
  const isInterrupted = isPending && !isActivelyStreaming && chatStatus !== undefined

  // Default: expanded while streaming, collapsed when done
  const [isExpanded, setIsExpanded] = useState(isStreaming)
  const wasStreamingRef = useRef(isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-collapse when streaming ends (transition from true -> false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  // Auto-scroll to bottom when streaming
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [part.input?.text, isStreaming, isExpanded])

  // Get thinking text
  const thinkingText = part.input?.text || ""

  // Build preview for collapsed state
  const previewText = thinkingText.slice(0, PREVIEW_LENGTH).replace(/\n/g, " ")

  // Show interrupted state if thinking was interrupted without completing
  if (isInterrupted && !thinkingText) {
    return <AgentToolInterrupted toolName="Thinking" />
  }

  return (
    <div>
      {/* Header - clickable to toggle, same as Exploring */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-start gap-1.5 py-0.5 px-2 cursor-pointer"
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <div className="text-xs flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0 text-muted-foreground">
              {isStreaming ? "Thinking" : "Thought"}
            </span>
            {/* Preview text when collapsed */}
            {!isExpanded && previewText && (
              <span className="text-muted-foreground/60 truncate">
                {previewText}...
              </span>
            )}
            {/* Chevron - rotates when expanded, visible on hover when collapsed */}
            <ChevronRight
              className={cn(
                "w-3.5 h-3.5 text-muted-foreground/60 transition-transform duration-200 ease-out flex-shrink-0",
                isExpanded && "rotate-90",
                !isExpanded && "opacity-0 group-hover:opacity-100",
              )}
            />
          </div>
        </div>
      </div>

      {/* Thinking content - only show when expanded */}
      {isExpanded && thinkingText && (
        <div className="relative">
          {/* Top gradient fade when streaming and has lots of content */}
          {isStreaming && thinkingText.length > SCROLL_THRESHOLD && (
            <div className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-background/70 to-transparent z-10 pointer-events-none" />
          )}

          {/* Scrollable container */}
          <div
            ref={scrollRef}
            className={cn(
              "px-2",
              isStreaming &&
                thinkingText.length > SCROLL_THRESHOLD &&
                "overflow-y-auto scrollbar-none max-h-24",
            )}
          >
            {/* Markdown content */}
            <ChatMarkdownRenderer
              content={thinkingText}
              size="sm"
              className="text-muted-foreground"
            />
            {/* Blinking cursor when streaming */}
            {isStreaming && (
              <span className="inline-block w-1 h-3 bg-muted-foreground/50 ml-0.5 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
