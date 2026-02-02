/**
 * ChatPane Component
 *
 * Left pane of the workflow modal for command execution and output streaming.
 * Displays command output in real-time with stdout/stderr differentiation.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useRef, useEffect } from "react"
import { Terminal, StopCircle, RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useFormattedOutput } from "../hooks/use-command-output"

interface OutputLine {
  id: string
  stream: "stdout" | "stderr"
  content: string
  timestamp: number
}

interface ChatPaneProps {
  /** Output lines to display */
  outputLines: OutputLine[]
  /** Whether command is currently streaming */
  isStreaming: boolean
  /** Whether command has completed */
  isComplete: boolean
  /** Whether there were errors */
  hasError: boolean
  /** Last error message */
  lastError?: string | null
  /** Callback to cancel command */
  onCancel?: () => void
  /** Callback to retry command */
  onRetry?: () => void
  /** Title for the pane */
  title?: string
  /** Additional header content */
  headerContent?: React.ReactNode
}

/**
 * ChatPane - Command output display with streaming support
 */
export const ChatPane = memo(function ChatPane({
  outputLines,
  isStreaming,
  isComplete,
  hasError,
  lastError,
  onCancel,
  onRetry,
  title = "Command Output",
  headerContent,
}: ChatPaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const formattedLines = useFormattedOutput(outputLines)

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [formattedLines.length, isStreaming])

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{title}</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Running...
            </span>
          )}
          {isComplete && !hasError && (
            <span className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </span>
          )}
          {isComplete && hasError && (
            <span className="flex items-center gap-1 text-xs text-red-500">
              <AlertCircle className="h-3 w-3" />
              Error
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {headerContent}
          {isStreaming && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
            >
              <StopCircle className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Output Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs"
      >
        {formattedLines.length === 0 && !isStreaming && !lastError && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Waiting for command output...</p>
            </div>
          </div>
        )}

        {formattedLines.map((line) => (
          <div
            key={line.id}
            className={cn(
              "py-0.5 whitespace-pre-wrap break-all",
              line.stream === "stderr" && "text-red-500"
            )}
          >
            {line.content}
          </div>
        ))}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="py-0.5 text-muted-foreground animate-pulse">
            ▌
          </div>
        )}
      </div>

      {/* Error Footer */}
      {lastError && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-red-200 bg-red-50 dark:bg-red-950/20">
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{lastError}</span>
          </div>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="flex-shrink-0 h-7 text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          )}
        </div>
      )}
    </div>
  )
})

ChatPane.displayName = "ChatPane"

/**
 * Minimal output display for inline use
 */
export const OutputDisplay = memo(function OutputDisplay({
  outputLines,
  isStreaming,
  maxHeight = 200,
}: {
  outputLines: OutputLine[]
  isStreaming: boolean
  maxHeight?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const formattedLines = useFormattedOutput(outputLines)

  useEffect(() => {
    if (scrollRef.current && isStreaming) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [formattedLines.length, isStreaming])

  if (formattedLines.length === 0 && !isStreaming) {
    return null
  }

  return (
    <div
      ref={scrollRef}
      className="bg-muted/30 rounded-lg p-3 font-mono text-xs overflow-y-auto"
      style={{ maxHeight }}
    >
      {formattedLines.map((line) => (
        <div
          key={line.id}
          className={cn(
            "py-0.5 whitespace-pre-wrap break-all",
            line.stream === "stderr" && "text-red-500"
          )}
        >
          {line.content}
        </div>
      ))}
      {isStreaming && (
        <span className="text-muted-foreground animate-pulse">▌</span>
      )}
    </div>
  )
})

OutputDisplay.displayName = "OutputDisplay"
