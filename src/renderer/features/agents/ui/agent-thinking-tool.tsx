"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { TextShimmer } from "../../../components/ui/text-shimmer"
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
  startedAt?: number
}

interface AgentThinkingToolProps {
  part: ThinkingToolPart
  chatStatus?: string
}

const PREVIEW_LENGTH = 60

function formatElapsedTime(ms: number): string {
  if (ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

export const AgentThinkingTool = memo(function AgentThinkingTool({
  part,
  chatStatus,
}: AgentThinkingToolProps) {
  const isPending =
    part.state !== "output-available" && part.state !== "output-error"
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isStreaming = isPending && isActivelyStreaming
  const isInterrupted = isPending && !isActivelyStreaming && chatStatus !== undefined

  // Default: expanded while streaming, collapsed when done
  const [isExpanded, setIsExpanded] = useState(isStreaming)
  const scrollRef = useRef<HTMLDivElement>(null)
  const wasStreamingRef = useRef(isStreaming)

  // Auto-collapse when streaming ends (transition from true -> false)
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming) {
      setIsExpanded(false)
    }
    wasStreamingRef.current = isStreaming
  }, [isStreaming])

  // Elapsed time — ticks every second while streaming
  const startedAtRef = useRef(part.startedAt || Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (!isStreaming) return
    const tick = () => setElapsedMs(Date.now() - startedAtRef.current)
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [isStreaming])

  // Auto-scroll when expanded during streaming
  useEffect(() => {
    if (isStreaming && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [part.input?.text, isStreaming, isExpanded])

  const thinkingText = part.input?.text || ""

  const previewText = thinkingText.slice(0, PREVIEW_LENGTH).replace(/\n/g, " ")

  const elapsedDisplay = isStreaming ? formatElapsedTime(elapsedMs) : ""

  if (isInterrupted && !thinkingText) {
    return <AgentToolInterrupted toolName="Thinking" />
  }

  return (
    <div>
      {/* Header - always visible, clickable to toggle */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-start gap-1.5 py-0.5 px-2 cursor-pointer"
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <div className="text-xs flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              {isStreaming ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  Thinking
                </TextShimmer>
              ) : (
                <span className="text-muted-foreground">Thought</span>
              )}
            </span>
            {/* Preview when collapsed */}
            {!isExpanded && previewText && (
              <span className="text-muted-foreground/60 truncate">
                {previewText}
              </span>
            )}
            {/* Elapsed time */}
            {elapsedDisplay && (
              <span className="text-muted-foreground/50 tabular-nums flex-shrink-0">
                {elapsedDisplay}
              </span>
            )}
            {/* Chevron */}
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

      {/* Content - expanded while streaming, collapsible after */}
      {isExpanded && thinkingText && (
        <div className="relative mt-1">
          {/* Top gradient fade when streaming */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
              isStreaming ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            ref={scrollRef}
            className={cn(
              "px-2 opacity-50",
              isStreaming && "overflow-y-auto scrollbar-none max-h-24",
            )}
          >
            <ChatMarkdownRenderer content={thinkingText} size="sm" isStreaming={isStreaming} />
          </div>
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
