"use client"

import { memo, useState, useEffect, useRef } from "react"
import { ChevronRight } from "lucide-react"
import { AgentToolRegistry, getToolStatus } from "./agent-tool-registry"
import { AgentToolCall } from "./agent-tool-call"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areTaskToolPropsEqual } from "./agent-tool-utils"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { cn } from "../../../lib/utils"

interface AgentTaskToolProps {
  part: any
  nestedTools: any[]
  chatStatus?: string
}

// Constants for rendering
const MAX_VISIBLE_TOOLS = 5
const TOOL_HEIGHT_PX = 24

// Format elapsed time in a human-readable format
function formatElapsedTime(ms: number): string {
  if (ms < 1000) return ""
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) return `${minutes}m`
  return `${minutes}m ${remainingSeconds}s`
}

export const AgentTaskTool = memo(function AgentTaskTool({
  part,
  nestedTools,
  chatStatus,
}: AgentTaskToolProps) {
  const { isPending, isInterrupted } = getToolStatus(part, chatStatus)

  // Default: collapsed
  const [isExpanded, setIsExpanded] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track elapsed time for running tasks
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  // Track if time became inaccurate due to window being hidden
  const [isTimeInaccurate, setIsTimeInaccurate] = useState(false)

  const description = part.input?.description || ""

  // Track elapsed time while task is running
  useEffect(() => {
    if (isPending) {
      // Start tracking time
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now()
      }
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedMs(Date.now() - startTimeRef.current)
        }
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [isPending])

  // Detect when window visibility changes - time becomes inaccurate when hidden
  useEffect(() => {
    if (!isPending) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Window became hidden while task is running - time will be inaccurate
        setIsTimeInaccurate(true)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [isPending])

  // Use output duration from Claude Code if available, otherwise use our tracked time
  const outputDuration = part.output?.duration || part.output?.duration_ms
  const displayMs = !isPending && outputDuration ? outputDuration : elapsedMs
  // Hide time if it became inaccurate while running, but show final time from output
  const shouldShowTime = !isPending || !isTimeInaccurate
  const elapsedTimeDisplay = shouldShowTime ? formatElapsedTime(displayMs) : ""

  // Auto-scroll to bottom when streaming and new nested tools added
  useEffect(() => {
    if (isPending && isExpanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [nestedTools.length, isPending, isExpanded])

  const hasNestedTools = nestedTools.length > 0

  // Build subtitle - always show description
  const getSubtitle = () => {
    if (description) {
      const truncated = description.length > 60 
        ? description.slice(0, 57) + "..." 
        : description
      return truncated
    }
    return ""
  }

  const subtitle = getSubtitle()

  // Get title text - always use "Task"
  const getTitle = () => {
    return isPending ? "Running Task" : "Task"
  }

  // Show interrupted state if task was interrupted without completing
  if (isInterrupted && !part.output) {
    return <AgentToolInterrupted toolName="Task" subtitle={subtitle} />
  }

  return (
    <div>
      {/* Header - clickable to toggle, same style as AgentExploringGroup */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="group flex items-start gap-1.5 py-0.5 px-2 cursor-pointer"
      >
        <div className="flex-1 min-w-0 flex items-center gap-1">
          <div className="text-xs flex items-center gap-1.5 min-w-0">
            {/* Title with shimmer effect when running */}
            {isPending ? (
              <TextShimmer
                as="span"
                duration={1.2}
                className="font-medium whitespace-nowrap flex-shrink-0"
              >
                {getTitle()}
              </TextShimmer>
            ) : (
              <span className="font-medium whitespace-nowrap flex-shrink-0 text-muted-foreground">
                {getTitle()}
              </span>
            )}
            {subtitle && (
              <span className="text-muted-foreground/60 truncate">
                {subtitle}
              </span>
            )}
            {/* Show elapsed time while running or final time when done */}
            {elapsedTimeDisplay && (
              <span className="text-muted-foreground/50 tabular-nums flex-shrink-0">
                {elapsedTimeDisplay}
              </span>
            )}
            {/* Chevron right after text - rotates when expanded */}
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

      {/* Nested tools - only show when expanded */}
      {hasNestedTools && isExpanded && (
        <div className="relative mt-1">
          {/* Top gradient fade when streaming and has many items */}
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none transition-opacity duration-200",
              isPending && nestedTools.length > MAX_VISIBLE_TOOLS
                ? "opacity-100"
                : "opacity-0",
            )}
          />

          {/* Scrollable container - auto-scrolls to bottom when streaming */}
          <div
            ref={scrollRef}
            className={cn(
              "space-y-1.5",
              isPending &&
                nestedTools.length > MAX_VISIBLE_TOOLS &&
                "overflow-y-auto scrollbar-hide",
            )}
            style={
              isPending && nestedTools.length > MAX_VISIBLE_TOOLS
                ? { maxHeight: `${MAX_VISIBLE_TOOLS * TOOL_HEIGHT_PX}px` }
                : undefined
            }
          >
            {nestedTools.map((nestedPart, idx) => {
              const nestedMeta = AgentToolRegistry[nestedPart.type]
              if (!nestedMeta) {
                return (
                  <div
                    key={idx}
                    className="text-xs text-muted-foreground py-0.5 px-2"
                  >
                    {nestedPart.type?.replace("tool-", "")}
                  </div>
                )
              }
              const { isPending: nestedIsPending, isError: nestedIsError } =
                getToolStatus(nestedPart, chatStatus)
              return (
                <AgentToolCall
                  key={idx}
                  icon={nestedMeta.icon}
                  title={nestedMeta.title(nestedPart)}
                  subtitle={nestedMeta.subtitle?.(nestedPart)}
                  isPending={nestedIsPending}
                  isError={nestedIsError}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}, areTaskToolPropsEqual)
