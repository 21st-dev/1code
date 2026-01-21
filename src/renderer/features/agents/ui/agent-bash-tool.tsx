"use client"

import { memo, useState, useMemo } from "react"
import { Check, X } from "lucide-react"
import {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { cn } from "../../../lib/utils"

interface AgentBashToolProps {
  part: any
  messageId?: string
  partIndex?: number
  chatStatus?: string
}

// Extract command summary - first word of each command in a pipeline
function extractCommandSummary(command: string): string {
  // First, normalize line continuations (backslash + newline) into single line
  const normalizedCommand = command.replace(/\\\s*\n\s*/g, " ")
  const parts = normalizedCommand.split(/\s*(?:&&|\|\||;|\|)\s*/)
  const firstWords = parts.map((p) => p.trim().split(/\s+/)[0]).filter(Boolean)
  // Limit to first 4 commands to keep it concise
  const limited = firstWords.slice(0, 4)
  if (firstWords.length > 4) {
    return limited.join(", ") + "..."
  }
  return limited.join(", ")
}

// Limit output to first N lines
function limitLines(text: string, maxLines: number): { text: string; truncated: boolean } {
  if (!text) return { text: "", truncated: false }
  const lines = text.split("\n")
  if (lines.length <= maxLines) {
    return { text, truncated: false }
  }
  return { text: lines.slice(0, maxLines).join("\n"), truncated: true }
}

export const AgentBashTool = memo(function AgentBashTool({
  part,
  messageId,
  partIndex,
  chatStatus,
}: AgentBashToolProps) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const { isPending } = getToolStatus(part, chatStatus)

  const command = part.input?.command || ""
  const stdout = part.output?.stdout || part.output?.output || ""
  const stderr = part.output?.stderr || ""
  const exitCode = part.output?.exitCode ?? part.output?.exit_code

  // For bash tools, success/error is determined by exitCode, not by state
  // exitCode 0 = success, anything else (or undefined if no output yet) = error
  const isSuccess = exitCode === 0
  const isError = exitCode !== undefined && exitCode !== 0

  // Determine if we have any output
  const hasOutput = stdout || stderr

  // Limit output to 3 lines when collapsed
  const MAX_OUTPUT_LINES = 3
  const stdoutLimited = useMemo(() => limitLines(stdout, MAX_OUTPUT_LINES), [stdout])
  const stderrLimited = useMemo(() => limitLines(stderr, MAX_OUTPUT_LINES), [stderr])
  const hasMoreOutput = stdoutLimited.truncated || stderrLimited.truncated

  // Memoize command summary to avoid recalculation on every render
  const commandSummary = useMemo(
    () => extractCommandSummary(command),
    [command],
  )

  // Check if command input is still being streamed
  // Only consider streaming if chat is actively streaming (prevents hang on stop)
  // Include "submitted" status - this is when request was sent but streaming hasn't started yet
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isInputStreaming = part.state === "input-streaming" && isActivelyStreaming

  // If command is still being generated (input-streaming state), show loading state
  if (isInputStreaming) {
    return (
      <div className="flex items-start gap-1.5 rounded-md py-0.5 px-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              <TextShimmer
                as="span"
                duration={1.2}
                className="inline-flex items-center text-xs leading-none h-4 m-0"
              >
                Generating command
              </TextShimmer>
            </span>
          </div>
        </div>
      </div>
    )
  }

  // If no command and not streaming, tool was interrupted
  if (!command) {
    return <AgentToolInterrupted toolName="Command" />
  }

  return (
    <div
      data-message-id={messageId}
      data-part-index={partIndex}
      data-part-type="tool-Bash"
      className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2"
    >
      {/* Header - clickable to expand, fixed height to prevent layout shift */}
      <div
        onClick={() => hasMoreOutput && !isPending && setIsOutputExpanded(!isOutputExpanded)}
        className={cn(
          "flex items-center justify-between pl-2.5 pr-2 h-7",
          hasMoreOutput && !isPending && "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <span className="text-xs text-muted-foreground truncate flex-1 min-w-0">
          {isPending ? "Running command: " : "Ran command: "}
          {commandSummary}
        </span>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Status - min-width ensures no layout shift */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-[60px] justify-end">
            {isPending ? (
              <IconSpinner className="w-3 h-3" />
            ) : isSuccess ? (
              <>
                <Check className="w-3 h-3" />
                <span>Success</span>
              </>
            ) : isError ? (
              <>
                <X className="w-3 h-3" />
                <span>Failed</span>
              </>
            ) : null}
          </div>

          {/* Expand/Collapse button - only show when not pending and has output that can be expanded */}
          {!isPending && hasOutput && hasMoreOutput && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                setIsOutputExpanded(!isOutputExpanded)
              }}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              {isOutputExpanded ? (
                <CollapseIcon className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ExpandIcon className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content - always visible, clickable to expand (only when collapsed and has more output) */}
      <div
        onClick={() =>
          hasMoreOutput && !isOutputExpanded && setIsOutputExpanded(true)
        }
        className={cn(
          "border-t border-border px-2.5 py-1.5 transition-colors duration-150",
          hasMoreOutput && !isOutputExpanded && "cursor-pointer hover:bg-muted/50",
        )}
      >
        {/* Command - always show full command */}
        <div className="font-mono text-xs">
          <span className="text-amber-600 dark:text-amber-400">$ </span>
          <span className="text-foreground whitespace-pre-wrap break-all">
            {command}
          </span>
        </div>

        {/* Stdout - show limited lines when collapsed, full when expanded */}
        {stdout && (
          <div className="mt-1.5 font-mono text-xs text-muted-foreground whitespace-pre-wrap break-all">
            {isOutputExpanded ? stdout : stdoutLimited.text}
          </div>
        )}

        {/* Stderr - warning/error color based on exit code */}
        {stderr && (
          <div
            className={cn(
              "mt-1.5 font-mono text-xs whitespace-pre-wrap break-all",
              // If exitCode is 0, it's a warning (e.g. npm warnings)
              // If exitCode is non-zero, it's an error
              exitCode === 0 || exitCode === undefined
                ? "text-amber-600 dark:text-amber-400"
                : "text-rose-500 dark:text-rose-400",
            )}
          >
            {isOutputExpanded ? stderr : stderrLimited.text}
          </div>
        )}

      </div>
    </div>
  )
}, areToolPropsEqual)
