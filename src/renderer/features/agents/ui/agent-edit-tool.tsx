"use client"

import { memo, useState, useEffect, useMemo, useCallback, useRef } from "react"
import { useSetAtom } from "jotai"
import { useCodeTheme } from "../../../lib/hooks/use-code-theme"
import { highlightCode } from "../../../lib/themes/shiki-theme-loader"
import {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { getToolStatus } from "./agent-tool-registry"
import { AgentToolInterrupted } from "./agent-tool-interrupted"
import { areToolPropsEqual } from "./agent-tool-utils"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import { agentsDiffSidebarOpenAtom, agentsFocusedDiffFileAtom } from "../atoms"
import { cn } from "../../../lib/utils"

interface AgentEditToolProps {
  part: any
  messageId?: string
  partIndex?: number
  chatStatus?: string
}

// Removed local highlighter - using centralized loader from lib/themes/shiki-theme-loader

// Get language from filename
function getLanguageFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || ""
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    sh: "bash",
    bash: "bash",
  }
  return langMap[ext] || "plaintext"
}

// Calculate diff stats from structuredPatch
function calculateDiffStatsFromPatch(
  patches: Array<{ lines?: string[] }>,
): { addedLines: number; removedLines: number } | null {
  if (!patches || patches.length === 0) return null

  let addedLines = 0
  let removedLines = 0

  for (const patch of patches) {
    // Skip patches without lines array
    if (!patch.lines) continue
    for (const line of patch.lines) {
      if (line.startsWith("+")) addedLines++
      else if (line.startsWith("-")) removedLines++
    }
  }

  return { addedLines, removedLines }
}

type DiffLine = { type: "added" | "removed" | "context"; content: string }

// Get all diff lines from structuredPatch
function getDiffLines(patches: Array<{ lines: string[] }>): DiffLine[] {
  const result: DiffLine[] = []

  if (!patches) return result

  for (const patch of patches) {
    for (const line of patch.lines) {
      if (line.startsWith("+")) {
        result.push({ type: "added", content: line.slice(1) })
      } else if (line.startsWith("-")) {
        result.push({ type: "removed", content: line.slice(1) })
      } else if (line.startsWith(" ")) {
        result.push({ type: "context", content: line.slice(1) })
      }
    }
  }

  return result
}

// Hook to batch-highlight all diff lines at once
// During streaming, skip highlighting entirely to maximize FPS
function useBatchHighlight(
  lines: DiffLine[],
  language: string,
  themeId: string,
  isStreaming: boolean = false,
): Map<number, string> {
  const [highlightedMap, setHighlightedMap] = useState<Map<number, string>>(
    () => new Map(),
  )

  // Create stable key from lines content to detect changes
  // Only compute when NOT streaming to avoid expensive join during animation
  const linesKey = useMemo(
    () => (isStreaming ? "" : lines.map((l) => l.content).join("\n")),
    [lines, isStreaming],
  )

  useEffect(() => {
    // Skip highlighting during streaming - show plain text for better FPS
    if (isStreaming) {
      return
    }

    if (lines.length === 0) {
      setHighlightedMap(new Map())
      return
    }

    let cancelled = false

    const highlightAll = async () => {
      try {
        const results = new Map<number, string>()

        // Highlight all lines in one batch using centralized loader
        for (let i = 0; i < lines.length; i++) {
          // Check if cancelled between iterations to allow early exit
          if (cancelled) return
          const content = lines[i].content || " "
          const highlighted = await highlightCode(content, language, themeId)
          results.set(i, highlighted)
        }

        if (!cancelled) {
          setHighlightedMap(results)
        }
      } catch (error) {
        console.error("Failed to highlight code:", error)
        // On error, leave map empty (fallback to plain text)
        if (!cancelled) {
          setHighlightedMap(new Map())
        }
      }
    }

    // Debounce highlighting after streaming completes
    const timer = setTimeout(highlightAll, 50)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [linesKey, language, themeId, lines.length, isStreaming])

  return highlightedMap
}

// Memoized component for rendering a single diff line
// Uses custom comparator to compare line content instead of object reference
const DiffLineRow = memo(
  function DiffLineRow({
    line,
    highlightedHtml,
  }: {
    line: DiffLine
    highlightedHtml: string | undefined
  }) {
    return (
      <div
        className={cn(
          "px-2.5 py-0.5",
          line.type === "removed" &&
            "bg-red-500/10 dark:bg-red-500/15 border-l-2 border-red-500/50",
          line.type === "added" &&
            "bg-green-500/10 dark:bg-green-500/15 border-l-2 border-green-500/50",
          line.type === "context" && "border-l-2 border-transparent",
        )}
      >
        {highlightedHtml ? (
          <span
            className="whitespace-pre-wrap break-all [&_.shiki]:bg-transparent [&_pre]:bg-transparent [&_code]:bg-transparent"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <span
            className={cn(
              "whitespace-pre-wrap break-all",
              line.type === "removed" && "text-red-700 dark:text-red-300",
              line.type === "added" && "text-green-700 dark:text-green-300",
              line.type === "context" && "text-muted-foreground",
            )}
          >
            {line.content || " "}
          </span>
        )}
      </div>
    )
  },
  // Custom comparator: compare line content and type, not object reference
  (prevProps, nextProps) =>
    prevProps.line.type === nextProps.line.type &&
    prevProps.line.content === nextProps.line.content &&
    prevProps.highlightedHtml === nextProps.highlightedHtml,
)

export const AgentEditTool = memo(function AgentEditTool({
  part,
  messageId,
  partIndex,
  chatStatus,
}: AgentEditToolProps) {
  const [isOutputExpanded, setIsOutputExpanded] = useState(false)
  const { isPending, isInterrupted } = getToolStatus(part, chatStatus)
  const codeTheme = useCodeTheme()

  // Atoms for opening diff sidebar and focusing on file
  const setDiffSidebarOpen = useSetAtom(agentsDiffSidebarOpenAtom)
  const setFocusedDiffFile = useSetAtom(agentsFocusedDiffFileAtom)

  // Determine tool type
  const isWriteMode = part.type === "tool-Write"
  const toolPrefix = isWriteMode ? "tool-Write" : "tool-Edit"

  // Only consider streaming if chat is actively streaming (prevents spinner hang on stop)
  // Include "submitted" status - this is when request was sent but streaming hasn't started yet
  const isActivelyStreaming = chatStatus === "streaming" || chatStatus === "submitted"
  const isInputStreaming = part.state === "input-streaming" && isActivelyStreaming

  const filePath = part.input?.file_path || ""
  const oldString = part.input?.old_string || ""
  const newString = part.input?.new_string || ""

  // For Write mode, content is in input.content
  const writeContent = part.input?.content || ""

  // Get structuredPatch from output (only available when complete)
  const structuredPatch = part.output?.structuredPatch

  // Extract filename from path
  const filename = filePath ? filePath.split("/").pop() || "file" : ""

  // Get clean display path (remove sandbox prefix to show project-relative path)
  const displayPath = useMemo(() => {
    if (!filePath) return ""
    // Remove common sandbox prefixes
    const prefixes = [
      "/project/sandbox/repo/",
      "/project/sandbox/",
      "/project/",
    ]
    for (const prefix of prefixes) {
      if (filePath.startsWith(prefix)) {
        return filePath.slice(prefix.length)
      }
    }
    // If path starts with /, try to find a reasonable root
    if (filePath.startsWith("/")) {
      // Look for common project roots
      const parts = filePath.split("/")
      const rootIndicators = ["apps", "packages", "src", "lib", "components"]
      const rootIndex = parts.findIndex((p: string) =>
        rootIndicators.includes(p),
      )
      if (rootIndex > 0) {
        return parts.slice(rootIndex).join("/")
      }
    }
    return filePath
  }, [filePath])

  // Handler to open diff sidebar and focus on this file
  const handleOpenInDiff = useCallback(() => {
    if (!displayPath) return
    setDiffSidebarOpen(true)
    setFocusedDiffFile(displayPath)
  }, [displayPath, setDiffSidebarOpen, setFocusedDiffFile])

  // Memoized click handlers to prevent inline function re-creation
  const handleHeaderClick = useCallback(() => {
    if (!isPending && !isInputStreaming) {
      setIsOutputExpanded(prev => !prev)
    }
  }, [isPending, isInputStreaming])

  const handleFilenameClick = useCallback((e: React.MouseEvent) => {
    if (displayPath) {
      e.stopPropagation()
      handleOpenInDiff()
    }
  }, [displayPath, handleOpenInDiff])

  const handleExpandButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOutputExpanded(prev => !prev)
  }, [])

  const handleContentClick = useCallback(() => {
    if (!isOutputExpanded && !isPending && !isInputStreaming) {
      setIsOutputExpanded(true)
    }
  }, [isOutputExpanded, isPending, isInputStreaming])

  // Get file icon component and language
  // Pass true to not show default icon for unknown file types
  const FileIcon = filename ? getFileIconByExtension(filename, true) : null
  const language = filename ? getLanguageFromFilename(filename) : "plaintext"

  // Calculate diff stats - prefer from patch, fallback to simple count
  // For Write mode, count all lines as added
  // For Edit mode without structuredPatch, count new_string lines as preview
  const diffStats = useMemo(() => {
    if (isWriteMode) {
      const content = writeContent || part.output?.content || ""
      const addedLines = content ? content.split("\n").length : 0
      return { addedLines, removedLines: 0 }
    }
    if (structuredPatch) {
      return calculateDiffStatsFromPatch(structuredPatch)
    }
    // Fallback: count new_string lines as preview (for input-available state)
    if (newString) {
      return { addedLines: newString.split("\n").length, removedLines: 0 }
    }
    return null
  }, [
    structuredPatch,
    isWriteMode,
    writeContent,
    part.output?.content,
    newString,
  ])

  // Get diff lines for display (memoized)
  // For Write mode, treat all lines as added
  // For Edit mode without structuredPatch, show new_string as preview
  const diffLines = useMemo(() => {
    if (isWriteMode) {
      const content = writeContent || part.output?.content || ""
      if (!content) return []
      return content.split("\n").map((line: string) => ({
        type: "added" as const,
        content: line,
      }))
    }
    // If we have structuredPatch, use it for proper diff display
    if (structuredPatch) {
      return getDiffLines(structuredPatch)
    }
    // Fallback: show new_string as preview (for input-available state before execution)
    if (newString) {
      return newString.split("\n").map((line: string) => ({
        type: "added" as const,
        content: line,
      }))
    }
    return []
  }, [
    structuredPatch,
    isWriteMode,
    writeContent,
    part.output?.content,
    newString,
  ])

  // For streaming state, get content being streamed
  const streamingContent = useMemo(() => {
    if (!isInputStreaming) return null
    if (isWriteMode) {
      return writeContent
    }
    return newString
  }, [isInputStreaming, isWriteMode, writeContent, newString])

  // Throttle streaming content updates for better FPS
  // Only update the displayed content every 100ms during streaming
  const [throttledStreamingContent, setThrottledStreamingContent] = useState<string | null>(null)
  const lastStreamingUpdateRef = useRef<number>(0)

  useEffect(() => {
    if (!isInputStreaming) {
      setThrottledStreamingContent(null)
      return
    }

    const now = Date.now()
    const timeSinceLastUpdate = now - lastStreamingUpdateRef.current

    // Throttle to ~10 updates per second (100ms intervals)
    if (timeSinceLastUpdate >= 100) {
      lastStreamingUpdateRef.current = now
      setThrottledStreamingContent(streamingContent)
    } else {
      // Schedule update for remaining time
      const timer = setTimeout(() => {
        lastStreamingUpdateRef.current = Date.now()
        setThrottledStreamingContent(streamingContent)
      }, 100 - timeSinceLastUpdate)
      return () => clearTimeout(timer)
    }
  }, [streamingContent, isInputStreaming])

  // Convert streaming content to diff lines
  // Up to 3 lines: show from top; more than 3 lines: show last N lines for autoscroll effect
  const { streamingLines, shouldAlignBottom } = useMemo(() => {
    const content = throttledStreamingContent
    if (!content)
      return { streamingLines: [], shouldAlignBottom: false }
    const lines = content.split("\n")
    const totalLines = lines.length
    // If 3 or fewer lines, show all from top
    // If more than 3, show last 15 lines for autoscroll effect
    const displayedLines = totalLines <= 3 ? lines : lines.slice(-15)
    return {
      streamingLines: displayedLines.map((line: string) => ({
        type: "added" as const,
        content: line,
      })),
      shouldAlignBottom: totalLines > 3,
    }
  }, [throttledStreamingContent])

  // Use streaming lines when streaming, otherwise use diff lines
  // IMPORTANT: Must be memoized to prevent infinite render loop!
  // Without useMemo, activeLines gets a new reference on every render, which triggers
  // firstChangeIndex -> displayLines -> useBatchHighlight -> setHighlightedMap -> re-render
  const activeLines = useMemo(
    () => isInputStreaming && streamingLines.length > 0 ? streamingLines : diffLines,
    [isInputStreaming, streamingLines, diffLines]
  )

  // Find index of first change line (added or removed) to focus on when collapsed
  // Prioritize added lines, but fall back to removed lines if no additions exist
  const firstChangeIndex = useMemo(() => {
    const firstAdded = activeLines.findIndex((line: DiffLine) => line.type === "added")
    if (firstAdded !== -1) return firstAdded
    // No additions - look for first removal instead
    return activeLines.findIndex((line: DiffLine) => line.type === "removed")
  }, [activeLines])

  // Reorder lines for collapsed view: show from first change line (memoized)
  const displayLines = useMemo(
    () =>
      !isOutputExpanded && firstChangeIndex > 0
        ? [
            ...activeLines.slice(firstChangeIndex),
            ...activeLines.slice(0, firstChangeIndex),
          ]
        : activeLines,
    [activeLines, isOutputExpanded, firstChangeIndex],
  )

  // Batch highlight all lines at once (instead of N×useEffect)
  // Pass isInputStreaming to use longer debounce during streaming for better FPS
  const highlightedMap = useBatchHighlight(
    displayLines,
    language,
    codeTheme,
    isInputStreaming,
  )

  // Check if we have VISIBLE content to show
  // For streaming, only show content area if we have some content to display
  // Use throttled content check during streaming for consistent render behavior
  const hasVisibleContent =
    displayLines.length > 0 ||
    (isInputStreaming && (throttledStreamingContent || newString || writeContent))

  // Header title based on mode and state (used only in minimal view)
  const headerAction = useMemo(() => {
    if (isWriteMode) {
      return isInputStreaming ? "Creating" : "Created"
    }
    return isInputStreaming ? "Editing" : "Edited"
  }, [isWriteMode, isInputStreaming])

  // Show minimal view (no background/border) until we have the full file path
  // This prevents showing a large empty component while path is being streamed
  if (!filePath) {
    // If interrupted without file path, show interrupted state
    if (isInterrupted) {
      return <AgentToolInterrupted toolName={isWriteMode ? "Write" : "Edit"} />
    }
    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5">
        <span className="text-xs text-muted-foreground">
          {isPending ? (
            <TextShimmer as="span" duration={1.2}>
              {headerAction}
            </TextShimmer>
          ) : (
            headerAction
          )}
        </span>
      </div>
    )
  }

  return (
    <div
      data-message-id={messageId}
      data-part-index={partIndex}
      data-part-type={toolPrefix}
      data-tool-file-path={displayPath}
      className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2"
    >
      {/* Header - clickable to expand, fixed height to prevent layout shift */}
      <div
        onClick={hasVisibleContent ? handleHeaderClick : undefined}
        className={cn(
          "flex items-center justify-between pl-2.5 pr-2 h-7",
          hasVisibleContent && !isPending && !isInputStreaming && "cursor-pointer hover:bg-muted/50 transition-colors duration-150",
        )}
      >
        <div
          onClick={handleFilenameClick}
          className={cn(
            "flex items-center gap-1.5 text-xs truncate flex-1 min-w-0",
            displayPath && "cursor-pointer hover:text-foreground",
          )}
        >
          {FileIcon && (
            <FileIcon className="w-2.5 h-2.5 flex-shrink-0 text-muted-foreground" />
          )}
          {/* Filename with shimmer during progress */}
          <Tooltip>
            <TooltipTrigger asChild>
              {isPending || isInputStreaming ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="truncate"
                >
                  {filename}
                </TextShimmer>
              ) : (
                <span className="truncate text-foreground">{filename}</span>
              )}
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="px-2 py-1.5 max-w-none flex items-center justify-center"
            >
              <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap leading-none">
                {displayPath}
              </span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Status and expand button */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Diff stats or spinner */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isPending || isInputStreaming ? (
              <IconSpinner className="w-3 h-3" />
            ) : diffStats ? (
              <>
                <span className="text-green-600 dark:text-green-400">
                  +{diffStats.addedLines}
                </span>
                {diffStats.removedLines > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    -{diffStats.removedLines}
                  </span>
                )}
              </>
            ) : null}
          </div>

          {/* Expand/Collapse button - show when has visible content and not streaming */}
          {hasVisibleContent && !isPending && !isInputStreaming && (
            <button
              onClick={handleExpandButtonClick}
              className="p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95"
            >
              <div className="relative w-4 h-4">
                <ExpandIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isOutputExpanded
                      ? "opacity-0 scale-75"
                      : "opacity-100 scale-100",
                  )}
                />
                <CollapseIcon
                  className={cn(
                    "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                    isOutputExpanded
                      ? "opacity-100 scale-100"
                      : "opacity-0 scale-75",
                  )}
                />
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Content - git-style diff with syntax highlighting */}
      {hasVisibleContent && (
        <div
          onClick={handleContentClick}
          className={cn(
            "border-t border-border transition-colors duration-150 font-mono text-xs",
            isOutputExpanded
              ? "max-h-[200px] overflow-y-auto"
              : "h-[72px] overflow-hidden", // Fixed height when collapsed
            !isOutputExpanded &&
              !isPending &&
              !isInputStreaming &&
              "cursor-pointer hover:bg-muted/50",
            // When streaming with > 3 lines, use flex to push content to bottom
            isInputStreaming &&
              shouldAlignBottom &&
              "flex flex-col justify-end",
          )}
        >
          {/* Display lines - either streaming content or completed diff */}
          {displayLines.length > 0 ? (
            <div
              className={cn(
                isInputStreaming && shouldAlignBottom && "flex-shrink-0",
              )}
            >
              {displayLines.map((line: DiffLine, idx: number) => (
                <DiffLineRow
                  // Stable key: type + index is sufficient during streaming
                  key={`${line.type}-${idx}`}
                  line={line}
                  highlightedHtml={highlightedMap.get(idx)}
                />
              ))}
            </div>
          ) : // Fallback: show raw streaming content when no lines parsed yet
          throttledStreamingContent || newString ? (
            <div
              className={cn(
                "px-2.5 py-1.5 text-green-700 dark:text-green-300 whitespace-pre-wrap break-all",
                isInputStreaming && shouldAlignBottom && "flex-shrink-0",
              )}
            >
              {isInputStreaming && !isOutputExpanded
                ? // Show last ~500 chars during streaming (use throttled for FPS)
                  (throttledStreamingContent || newString).slice(-500)
                : throttledStreamingContent || newString}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
