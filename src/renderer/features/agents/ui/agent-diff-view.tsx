"use client"

import {
  Component,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  startTransition,
  useDeferredValue,
  type ReactNode,
  type ErrorInfo,
} from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { agentsFocusedDiffFileAtom, filteredDiffFilesAtom, viewedFilesAtomFamily, type ViewedFileState } from "../atoms"
import { DiffModeEnum, DiffView, DiffFile } from "@git-diff-view/react"
import "@git-diff-view/react/styles/diff-view-pure.css"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Columns2,
  Rows2,
} from "lucide-react"
import {
  ClipboardIcon,
  ExternalLinkIcon,
  FolderIcon,
  UndoIcon,
} from "../../../components/ui/icons"
import { useVirtualizer } from "@tanstack/react-virtual"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../components/ui/alert-dialog"
import { Button } from "../../../components/ui/button"
import {
  IconSpinner,
  PullRequestIcon,
  IconChatBubble,
  ExpandIcon,
  CollapseIcon,
} from "../../../components/ui/icons"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { Kbd } from "../../../components/ui/kbd"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu"
// e2b API routes are used instead of useSandboxManager for agents
// import { useIsHydrated } from "@/hooks/use-is-hydrated"
const useIsHydrated = () => true // Desktop is always hydrated
import { cn } from "../../../lib/utils"
import { api } from "../../../lib/mock-api"
import { trpcClient } from "../../../lib/trpc"
import {
  getDiffHighlighter,
  setDiffViewTheme,
  type DiffHighlighter,
} from "../../../lib/themes/diff-view-highlighter"
import { useCodeTheme } from "../../../lib/hooks/use-code-theme"

// Simple fast string hash (djb2 algorithm) for content change detection
function hashString(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i)
  }
  // Convert to base36 for compact string representation
  return (hash >>> 0).toString(36)
}

// Error Boundary for DiffView to catch parsing errors
interface DiffErrorBoundaryProps {
  children: ReactNode
  fileName: string
  /** Raw diff text to show as fallback when parsing fails */
  rawDiff?: string
}

interface DiffErrorBoundaryState {
  hasError: boolean
  error: Error | null
  prevRawDiff: string | undefined
}

class DiffErrorBoundary extends Component<
  DiffErrorBoundaryProps,
  DiffErrorBoundaryState
> {
  constructor(props: DiffErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, prevRawDiff: props.rawDiff }
  }

  static getDerivedStateFromError(error: Error): Partial<DiffErrorBoundaryState> {
    return { hasError: true, error }
  }

  static getDerivedStateFromProps(
    props: DiffErrorBoundaryProps,
    state: DiffErrorBoundaryState
  ): Partial<DiffErrorBoundaryState> | null {
    // Reset error state when rawDiff changes (different file)
    if (props.rawDiff !== state.prevRawDiff) {
      return { hasError: false, error: null, prevRawDiff: props.rawDiff }
    }
    return null
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Error already captured in state, no need to log
  }

  render() {
    if (this.state.hasError) {
      // Show raw diff as fallback when library fails to parse
      if (this.props.rawDiff) {
        const lines = this.props.rawDiff.split('\n')
        // Find first hunk header to skip diff metadata
        const firstHunkIdx = lines.findIndex(l => l.startsWith('@@'))
        const contentLines = firstHunkIdx > 0 ? lines.slice(firstHunkIdx) : lines

        return (
          <div className="text-xs font-mono overflow-x-auto">
            {contentLines.map((line, i) => {
              let className = "block px-3 py-px min-h-[20px]"
              if (line.startsWith('+') && !line.startsWith('+++')) {
                className += " text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                className += " text-red-600 dark:text-red-400 bg-red-500/10"
              } else if (line.startsWith('@@')) {
                className += " text-muted-foreground bg-blue-500/5 py-1 mt-1 first:mt-0"
              }
              return <code key={i} className={className}>{line || ' '}</code>
            })}
          </div>
        )
      }
      return (
        <div className="flex items-center gap-2 p-4 text-sm text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30 rounded-md">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Failed to render diff for this file. The diff format may be
            corrupted or truncated.
          </span>
        </div>
      )
    }

    return this.props.children
  }
}

// Suppress @git-diff-view mismatch warnings globally in development
// These warnings are caused by the library's internal validation which runs even in pure diff mode
// The validation compares composed file content with diff hunks, but since we use pure diff mode
// (content: null), the library composes content from diff which may have slight formatting differences
if (typeof window !== "undefined") {
  const originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    const message = args[0]
    if (typeof message === "string" && message.includes("mismatch")) {
      return // Suppress mismatch warnings from @git-diff-view
    }
    originalWarn.apply(console, args)
  }
}

export type ParsedDiffFile = {
  key: string
  oldPath: string
  newPath: string
  diffText: string
  isBinary: boolean
  additions: number
  deletions: number
  isValid?: boolean // Whether the diff format is valid/complete
  // Extended fields from server-side parsing (optional for backwards compat)
  fileLang?: string | null
  isNewFile?: boolean
  isDeletedFile?: boolean
}

type DiffViewData = {
  oldFile?: {
    fileName?: string | null
    fileLang?: string | null
    content?: string | null
  }
  newFile?: {
    fileName?: string | null
    fileLang?: string | null
    content?: string | null
  }
  hunks: string[]
}

export const diffViewModeAtom = atomWithStorage<DiffModeEnum>(
  "agents-diff:view-mode",
  DiffModeEnum.Unified,
)

// Validate if a diff hunk has valid structure
// This is a lenient validator - only reject clearly malformed diffs
// Don't count lines strictly since edge cases are hard to handle
const validateDiffHunk = (
  diffText: string,
): { valid: boolean; reason?: string } => {
  if (!diffText || diffText.trim().length === 0) {
    return { valid: false, reason: "empty diff" }
  }

  const lines = diffText.split("\n")
  const hunkHeaderRegex = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/

  // Find the --- and +++ lines
  const minusLineIdx = lines.findIndex((l) => l.startsWith("--- "))
  const plusLineIdx = lines.findIndex((l) => l.startsWith("+++ "))

  // Must have both header lines
  if (minusLineIdx === -1 || plusLineIdx === -1) {
    return { valid: false, reason: `missing header lines` }
  }

  // +++ must come after ---
  if (plusLineIdx <= minusLineIdx) {
    return { valid: false, reason: `header order wrong` }
  }

  // Check for special cases that don't have hunks
  if (
    diffText.includes("new mode") ||
    diffText.includes("old mode") ||
    diffText.includes("rename from") ||
    diffText.includes("rename to") ||
    diffText.includes("Binary files")
  ) {
    return { valid: true }
  }

  // Must have at least one hunk header after +++ line
  let hasHunk = false
  for (let i = plusLineIdx + 1; i < lines.length; i++) {
    if (hunkHeaderRegex.test(lines[i]!)) {
      hasHunk = true
      break
    }
  }

  if (!hasHunk) {
    return { valid: false, reason: "no hunk headers found" }
  }

  // Trust the diff format - the DiffView library will handle parsing
  // If it fails, the error boundary will catch it
  return { valid: true }
}

export const splitUnifiedDiffByFile = (diffText: string): ParsedDiffFile[] => {
  const normalized = diffText.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")

  const blocks: string[] = []
  let current: string[] = []

  const pushCurrent = () => {
    const text = current.join("\n").trim()
    if (
      text &&
      (text.startsWith("diff --git ") ||
        text.startsWith("--- ") ||
        text.startsWith("+++ ") ||
        text.startsWith("Binary files ") ||
        text.includes("\n+++ ") ||
        text.includes("\nBinary files "))
    ) {
      blocks.push(text)
    }
    current = []
  }

  for (const line of lines) {
    if (line.startsWith("diff --git ") && current.length > 0) {
      pushCurrent()
    }
    current.push(line)
  }
  pushCurrent()

  return blocks.map((blockText, index) => {
    const blockLines = blockText.split("\n")
    let oldPath = ""
    let newPath = ""
    let isBinary = false
    let additions = 0
    let deletions = 0

    for (const line of blockLines) {
      if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
        isBinary = true
      }

      if (line.startsWith("--- ")) {
        const raw = line.slice(4).trim()
        oldPath = raw.startsWith("a/") ? raw.slice(2) : raw
      }

      if (line.startsWith("+++ ")) {
        const raw = line.slice(4).trim()
        newPath = raw.startsWith("b/") ? raw.slice(2) : raw
      }

      if (line.startsWith("+") && !line.startsWith("+++ ")) {
        additions += 1
      } else if (line.startsWith("-") && !line.startsWith("--- ")) {
        deletions += 1
      }
    }

    const key = oldPath || newPath ? `${oldPath}->${newPath}` : `file-${index}`
    const validation = isBinary ? { valid: true } : validateDiffHunk(blockText)
    const isValid = validation.valid

    return {
      key,
      oldPath,
      newPath,
      diffText: blockText,
      isBinary,
      additions,
      deletions,
      isValid,
    }
  })
}

interface FileDiffCardProps {
  file: ParsedDiffFile
  data: DiffViewData
  isLight: boolean
  isCollapsed: boolean
  toggleCollapsed: (fileKey: string) => void
  isFullExpanded: boolean
  toggleFullExpanded: (fileKey: string) => void
  hasContent: boolean
  isLoadingContent: boolean
  diffMode: DiffModeEnum
  shikiHighlighter: Omit<DiffHighlighter, "getHighlighterEngine"> | null
  /** Worktree path for file operations */
  worktreePath?: string
  /** Callback to discard changes for this file */
  onDiscardFile?: (filePath: string) => void
  /** Whether this file has been marked as viewed */
  isViewed: boolean
  /** Callback to toggle viewed state */
  onToggleViewed: (fileKey: string, diffText: string) => void
}

// Custom comparator to prevent unnecessary re-renders
const fileDiffCardAreEqual = (
  prev: FileDiffCardProps,
  next: FileDiffCardProps,
): boolean => {
  // Key comparison - file identity
  if (prev.file.key !== next.file.key) return false
  // Diff content changes should re-render even when the file key is stable.
  if (prev.file.diffText !== next.file.diffText) return false
  // State that affects rendering
  if (prev.isCollapsed !== next.isCollapsed) return false
  if (prev.isFullExpanded !== next.isFullExpanded) return false
  if (prev.hasContent !== next.hasContent) return false
  if (prev.isLoadingContent !== next.isLoadingContent) return false
  if (prev.diffMode !== next.diffMode) return false
  if (prev.isLight !== next.isLight) return false
  // Highlighter presence
  if ((prev.shikiHighlighter === null) !== (next.shikiHighlighter === null))
    return false
  // Worktree path for context menu
  if (prev.worktreePath !== next.worktreePath) return false
  // Viewed state
  if (prev.isViewed !== next.isViewed) return false
  return true
}

const FileDiffCard = memo(function FileDiffCard({
  file,
  data,
  isLight,
  isCollapsed,
  toggleCollapsed,
  isFullExpanded,
  toggleFullExpanded,
  hasContent,
  isLoadingContent,
  diffMode,
  shikiHighlighter,
  worktreePath,
  onDiscardFile,
  isViewed,
  onToggleViewed,
}: FileDiffCardProps) {
  const diffViewRef = useRef<{ getDiffFileInstance: () => DiffFile } | null>(
    null,
  )
  const diffCardRef = useRef<HTMLDivElement>(null)
  const prevExpandedRef = useRef(isFullExpanded)

  // tRPC mutations for file operations
  const openInFinderMutation = trpcClient.external.openInFinder.mutate
  const openInEditorMutation = trpcClient.external.openFileInEditor.mutate

  // Expand/collapse all hunks when button is clicked
  useEffect(() => {
    if (prevExpandedRef.current === isFullExpanded) return
    prevExpandedRef.current = isFullExpanded

    const diffFile = diffViewRef.current?.getDiffFileInstance()
    if (!diffFile) return

    const mode = diffMode === DiffModeEnum.Split ? "split" : "unified"

    // Use requestAnimationFrame to prevent ResizeObserver loop
    // The expand/collapse causes layout changes that trigger virtualizer's ResizeObserver
    requestAnimationFrame(() => {
      try {
        if (isFullExpanded) {
          diffFile.onAllExpand(mode)
          diffFile.initSyntax()
          diffFile.notifyAll()
        } else {
          diffFile.onAllCollapse(mode)
        }
      } catch {
        /* ignore - library may throw on malformed diffs */
      }
    })
  }, [isFullExpanded, diffMode])

  // Extract filename and directory from path
  const displayPath =
    file.newPath && file.newPath !== "/dev/null"
      ? file.newPath
      : file.oldPath && file.oldPath !== "/dev/null"
        ? file.oldPath
        : file.key
  const fileName = displayPath.split("/").pop() || displayPath
  const dirPath = displayPath.includes("/")
    ? displayPath.substring(0, displayPath.lastIndexOf("/"))
    : null

  const isNewFile = file.oldPath === "/dev/null" && file.newPath
  const isDeletedFile = file.newPath === "/dev/null" && file.oldPath

  // Absolute path for file operations
  const absolutePath = worktreePath ? `${worktreePath}/${displayPath}` : null

  const handleCopyPath = async () => {
    if (absolutePath) {
      await navigator.clipboard.writeText(absolutePath)
      toast.success("Copied to clipboard", { description: absolutePath })
    }
  }

  const handleCopyRelativePath = async () => {
    await navigator.clipboard.writeText(displayPath)
    toast.success("Copied to clipboard", { description: displayPath })
  }

  const handleRevealInFinder = () => {
    if (absolutePath) {
      openInFinderMutation(absolutePath)
    }
  }

  const handleOpenInEditor = () => {
    if (absolutePath && worktreePath) {
      openInEditorMutation({ path: absolutePath, cwd: worktreePath })
    }
  }

  const handleDiscard = () => {
    if (onDiscardFile) {
      onDiscardFile(displayPath)
    }
  }

  const headerContent = (
    <header
      className={cn(
        "group pl-3 pr-2 py-1 font-mono text-xs bg-muted cursor-pointer",
        // Sticky header within the scroll container
        "sticky top-0 z-10",
        "border-b transition-colors",
        "hover:bg-accent/50",
        isCollapsed ? "border-b-transparent" : "border-b-border",
      )}
      onClick={() => toggleCollapsed(file.key)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          toggleCollapsed(file.key)
        }
      }}
      aria-expanded={!isCollapsed}
    >
        <div className="flex items-center gap-2">
          {/* Collapse toggle + file info */}
          <div className="flex-1 flex items-center gap-2 text-left min-w-0 min-h-[22px]">
            {/* Icon container with hover swap */}
            {(() => {
              const FileIcon = getFileIconByExtension(fileName)
              return (
                <div className="relative w-3.5 h-3.5 shrink-0">
                  {FileIcon && (
                    <FileIcon
                      className={cn(
                        "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-all duration-200",
                        "group-hover:opacity-0 group-hover:scale-75",
                      )}
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-all duration-200",
                      "opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                </div>
              )
            })()}

            {/* File name + path + status */}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="font-medium text-foreground shrink-0">
                {fileName}
              </span>
              {dirPath && (
                <span className="text-muted-foreground truncate text-[11px] min-w-0">
                  {dirPath}
                </span>
              )}
              {isNewFile && (
                <span className="shrink-0 text-[11px] text-emerald-600 dark:text-emerald-400">
                  (new)
                </span>
              )}
              {isDeletedFile && (
                <span className="shrink-0 text-[11px] text-red-600 dark:text-red-400">
                  (deleted)
                </span>
              )}
            </div>

            {/* Stats */}
            <span className="shrink-0 font-mono text-[11px] tabular-nums whitespace-nowrap">
              {file.additions > 0 && (
                <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">
                  +{file.additions}
                </span>
              )}
              {file.deletions > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  -{file.deletions}
                </span>
              )}
            </span>
          </div>

          {/* Expand/Collapse full file button - only show if content is available */}
          {!isCollapsed && !file.isBinary && hasContent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFullExpanded(file.key)
                  }}
                  className={cn(
                    "shrink-0 p-1 rounded-md hover:bg-accent transition-[background-color,transform] duration-150 ease-out active:scale-95",
                    isFullExpanded && "bg-accent",
                  )}
                  aria-pressed={isFullExpanded}
                >
                  <div className="relative w-3.5 h-3.5">
                    <ExpandIcon
                      className={cn(
                        "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                        isFullExpanded
                          ? "opacity-0 scale-75"
                          : "opacity-100 scale-100",
                      )}
                    />
                    <CollapseIcon
                      className={cn(
                        "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                        isFullExpanded
                          ? "opacity-100 scale-100"
                          : "opacity-0 scale-75",
                      )}
                    />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {isFullExpanded ? "Show changes only" : "Show full file"}
              </TooltipContent>
            </Tooltip>
          )}
          {/* Show loading spinner while content is being fetched */}
          {!isCollapsed &&
            !file.isBinary &&
            !hasContent &&
            isLoadingContent && (
              <div className="shrink-0 p-1">
                <IconSpinner className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}

          {/* Viewed checkbox with label - GitHub style */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleViewed(file.key, file.diffText)
                }}
                className={cn(
                  "shrink-0 h-6 pl-1 pr-1.5 rounded-md flex items-center gap-1 transition-all duration-150 text-xs font-medium",
                  isViewed
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-pressed={isViewed}
              >
                <div className={cn(
                  "size-4 rounded flex items-center justify-center transition-all duration-150",
                  isViewed
                    ? "bg-primary text-primary-foreground"
                    : "border border-muted-foreground/40",
                )}>
                  {isViewed && <Check className="size-3" strokeWidth={2.5} />}
                </div>
                <span>Viewed</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isViewed ? "Mark as unviewed" : "Mark as viewed"}
              <Kbd>V</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
  )

  return (
    <div
      ref={diffCardRef}
      className="bg-background rounded-lg border border-border overflow-clip"
      data-diff-file-path={file.newPath || file.oldPath}
    >
      {worktreePath ? (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {headerContent}
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <ContextMenuItem onClick={handleCopyPath} className="text-xs">
              <ClipboardIcon className="mr-2 size-3.5" />
              Copy File Path
            </ContextMenuItem>
            <ContextMenuItem onClick={handleCopyRelativePath} className="text-xs">
              <ClipboardIcon className="mr-2 size-3.5" />
              Copy Relative File Path
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={handleRevealInFinder} className="text-xs">
              <FolderIcon className="mr-2 size-3.5" />
              Reveal in Finder
            </ContextMenuItem>
            <ContextMenuItem onClick={handleOpenInEditor} className="text-xs">
              <ExternalLinkIcon className="mr-2 size-3.5" />
              Open in Editor
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onToggleViewed(file.key, file.diffText)}
              className="text-xs justify-between"
            >
              {isViewed ? "Mark as unviewed" : "Mark as viewed"}
              <Kbd>V</Kbd>
            </ContextMenuItem>
            {onDiscardFile && !isDeletedFile && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={handleDiscard}
                  className="text-xs data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
                >
                  Discard Changes
                </ContextMenuItem>
              </>
            )}
          </ContextMenuContent>
        </ContextMenu>
      ) : (
        headerContent
      )}

      {/* Content area */}
      {!isCollapsed && (
        <div>
          {file.isBinary ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              Binary file diff can't be rendered.
            </div>
          ) : !file.isValid ? (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-500 bg-yellow-50 dark:bg-yellow-950/30">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Diff format appears truncated or corrupted. Unable to render
                this file's changes.
              </span>
            </div>
          ) : (
            <div className="agent-diff-wrapper">
              <DiffErrorBoundary fileName={file.newPath || file.oldPath} rawDiff={file.diffText}>
                <DiffView
                  ref={diffViewRef}
                  data={data}
                  diffViewTheme={isLight ? "light" : "dark"}
                  diffViewMode={diffMode}
                  diffViewHighlight={!!shikiHighlighter}
                  diffViewWrap={false}
                  registerHighlighter={shikiHighlighter ?? undefined}
                />
              </DiffErrorBoundary>
            </div>
          )}
        </div>
      )}
    </div>
  )
}, fileDiffCardAreEqual)

export interface DiffStats {
  fileCount: number
  additions: number
  deletions: number
  isLoading: boolean
  hasChanges: boolean
}

interface AgentDiffViewProps {
  chatId: string
  sandboxId: string
  /** Worktree path for local file access (desktop only) */
  worktreePath?: string
  repository?: string
  onStatsChange?: (stats: DiffStats) => void
  /** Pre-loaded diff content to avoid duplicate fetch */
  initialDiff?: string | null
  /** Pre-parsed file diffs to avoid duplicate parsing (takes precedence over initialDiff) */
  initialParsedFiles?: ParsedDiffFile[] | null
  /** Pre-fetched file contents for instant expand (desktop only) */
  prefetchedFileContents?: Record<string, string>
  /** Whether to show the footer with Create PR button (default: true) */
  showFooter?: boolean
  /** Callback to create PR - if provided, used instead of internal mutation */
  onCreatePr?: () => void
  /** Whether PR is being created (for external control) */
  isCreatingPr?: boolean
  /** Mobile mode - shows mobile-specific header */
  isMobile?: boolean
  /** Callback to close the diff view (for mobile back button) */
  onClose?: () => void
  /** Callback when collapsed state changes - reports if all collapsed/all expanded */
  onCollapsedStateChange?: (state: {
    allCollapsed: boolean
    allExpanded: boolean
  }) => void
  /** Callback to select next file in the file list (when marking as viewed) */
  onSelectNextFile?: (filePath: string) => void
  /** Callback when viewed count changes (for stable header updates) */
  onViewedCountChange?: (count: number) => void
  /** Initial selected file path - used to filter on first render before atom updates */
  initialSelectedFile?: string | null
}

/** Ref handle for controlling AgentDiffView from parent */
export interface AgentDiffViewRef {
  expandAll: () => void
  collapseAll: () => void
  isAllCollapsed: () => boolean
  isAllExpanded: () => boolean
  // Viewed files methods
  getViewedCount: () => number
  markAllViewed: () => void
  markAllUnviewed: () => void
}

export const AgentDiffView = forwardRef<AgentDiffViewRef, AgentDiffViewProps>(
  function AgentDiffView(
    {
      chatId,
      sandboxId,
      worktreePath,
      repository,
      onStatsChange,
      initialDiff,
      initialParsedFiles,
      prefetchedFileContents,
      showFooter = true,
      onCreatePr: externalOnCreatePr,
      isCreatingPr: externalIsCreatingPr,
      isMobile = false,
      onClose,
      onCollapsedStateChange,
      onSelectNextFile,
      onViewedCountChange,
      initialSelectedFile,
    },
    ref,
  ) {
    const { resolvedTheme } = useTheme()
    const isHydrated = useIsHydrated()
    const codeThemeId = useCodeTheme()

    // Shiki highlighter for syntax highlighting in diff view
    const [shikiHighlighter, setShikiHighlighter] = useState<Omit<
      DiffHighlighter,
      "getHighlighterEngine"
    > | null>(null)

    // Update diff view theme when code theme changes
    useEffect(() => {
      setDiffViewTheme(codeThemeId)
    }, [codeThemeId])

    // Load shiki highlighter AFTER first paint - critical for instant sidebar opening
    // The getDiffHighlighter() call can block main thread for ~1s even if preloaded
    useEffect(() => {
      let cancelled = false

      // Wait for first paint before even starting to load highlighter
      // This ensures the diff sidebar is visible immediately
      requestAnimationFrame(() => {
        if (cancelled) return
        requestAnimationFrame(() => {
          if (cancelled) return
          // Now we're after paint, safe to load highlighter
          const start = performance.now()
          getDiffHighlighter()
            .then((highlighter) => {
              const elapsed = performance.now() - start
              if (!cancelled) {
                setShikiHighlighter(highlighter)
              }
            })
            .catch((err) => {
              console.error("Failed to load diff highlighter:", err)
            })
        })
      })

      return () => {
        cancelled = true
      }
    }, [])

    const [diff, setDiff] = useState<string | null>(initialDiff ?? null)
    // Loading if initialDiff not provided, or if it's null AND no parsed files array provided
    // Note: empty array [] means "no changes", null/undefined means "still loading"
    const [isLoadingDiff, setIsLoadingDiff] = useState(
      initialDiff === undefined ||
        (initialDiff === null && !Array.isArray(initialParsedFiles)),
    )

    const [diffError, setDiffError] = useState<string | null>(null)
    // Use local state for collapsed - faster than atom for frequent updates
    const [collapsedByFileKey, setCollapsedByFileKey] = useState<
      Record<string, boolean>
    >({})
    const [fullExpandedByFileKey, setFullExpandedByFileKey] = useState<
      Record<string, boolean>
    >({})
    const [diffMode, setDiffMode] = useAtom(diffViewModeAtom)

    // Discard changes state and mutation
    const [discardFilePath, setDiscardFilePath] = useState<string | null>(null)

    const handleDiscardFile = useCallback((filePath: string) => {
      setDiscardFilePath(filePath)
    }, [])

    // Viewed files state for tracking reviewed files (GitHub-style)
    const [viewedFiles, setViewedFiles] = useAtom(viewedFilesAtomFamily(chatId))

    // Undo stack for viewed actions (stores previous viewedFiles states)
    const viewedUndoStackRef = useRef<Array<{ fileKey: string; previousState: ViewedFileState | undefined }>>([])

    // Check if file is viewed (and content hasn't changed since marking as viewed)
    const isFileViewed = useCallback((fileKey: string, diffText: string): boolean => {
      const viewedState = viewedFiles[fileKey]
      if (!viewedState?.viewed) return false
      // If content hash changed, file is no longer "viewed"
      return viewedState.contentHash === hashString(diffText)
    }, [viewedFiles])

    // Pre-fetched file contents for expand functionality
    // Use prefetched data if available, otherwise start empty
    const [fileContents, setFileContents] = useState<Record<string, string>>(
      prefetchedFileContents ?? {},
    )
    const [isLoadingFileContents, setIsLoadingFileContents] = useState(false)

    // Sync with prefetched file contents when they arrive after mount
    useEffect(() => {
      if (
        prefetchedFileContents &&
        Object.keys(prefetchedFileContents).length > 0
      ) {
        setFileContents(prefetchedFileContents)
      }
    }, [prefetchedFileContents])

    // Focused file for scroll-to functionality
    const focusedDiffFile = useAtomValue(agentsFocusedDiffFileAtom)
    const setFocusedDiffFile = useSetAtom(agentsFocusedDiffFileAtom)
    const scrollContainerRef = useRef<HTMLDivElement>(null)

    // Height for collapsed header (file name + stats)
    const COLLAPSED_HEIGHT = 44
    // Estimated height for expanded diff
    const EXPANDED_HEIGHT_ESTIMATE = 300

    // Fetch diff on mount (only if initialDiff not provided)
    useEffect(() => {
      // Skip fetch if initialDiff was provided with actual content or parsed files
      if (initialDiff !== undefined) {
        setDiff(initialDiff)
        // Only mark as not loading if we have actual data or parsed files array
        // Note: empty array [] means "no changes", null/undefined means "still loading"
        const parentStillLoading =
          initialDiff === null && !Array.isArray(initialParsedFiles)
        setIsLoadingDiff(parentStillLoading)
        return
      }

      const fetchDiff = async () => {
        // Desktop: use tRPC if no sandboxId
        if (!sandboxId && chatId) {
          try {
            setIsLoadingDiff(true)
            const result = await trpcClient.chats.getDiff.query({ chatId })
            const diffContent = result.diff || ""
            setDiff(diffContent.trim() ? diffContent : "")
          } catch (error) {
            setDiffError(
              error instanceof Error ? error.message : "Failed to fetch diff",
            )
          } finally {
            setIsLoadingDiff(false)
          }
          return
        }

        // Web: use sandbox API
        if (!sandboxId) {
          setDiffError("Sandbox ID is required")
          setIsLoadingDiff(false)
          return
        }

        try {
          setIsLoadingDiff(true)

          const response = await fetch(`/api/agents/sandbox/${sandboxId}/diff`)
          if (!response.ok) {
            throw new Error(`Failed to fetch diff: ${response.statusText}`)
          }

          const data = await response.json()
          const diffContent = data.diff || ""

          if (diffContent.trim()) {
            setDiff(diffContent)
          } else {
            setDiff("")
          }
        } catch (error) {
          setDiffError(
            error instanceof Error ? error.message : "Failed to fetch diff",
          )
        } finally {
          setIsLoadingDiff(false)
        }
      }

      fetchDiff()
    }, [sandboxId, chatId, initialDiff, initialParsedFiles])

    const handleRefresh = useCallback(async () => {
      setIsLoadingDiff(true)
      setDiffError(null)

      try {
        let diffContent = ""

        // Desktop: use tRPC to get diff from worktree
        if (chatId && !sandboxId) {
          const result = await trpcClient.chats.getDiff.query({ chatId })
          diffContent = result.diff || ""
        }
        // Web: use sandbox API
        else if (sandboxId) {
          const response = await fetch(`/api/agents/sandbox/${sandboxId}/diff`)
          if (!response.ok) {
            throw new Error(`Failed to fetch diff: ${response.statusText}`)
          }
          const data = await response.json()
          diffContent = data.diff || ""
        }

        if (diffContent.trim()) {
          setDiff(diffContent)
        } else {
          setDiff("")
        }
      } catch (error) {
        setDiffError(
          error instanceof Error ? error.message : "Failed to fetch diff",
        )
      } finally {
        setIsLoadingDiff(false)
      }
    }, [chatId, sandboxId])

    const isLight = isHydrated ? resolvedTheme !== "dark" : true

    // Read filter for sub-chat specific file filtering
    const filteredDiffFiles = useAtomValue(filteredDiffFilesAtom)
    const setFilteredDiffFiles = useSetAtom(filteredDiffFilesAtom)

    // Clear filter when component unmounts (not during close animation, only on actual unmount)
    useEffect(() => {
      return () => {
        setFilteredDiffFiles(null)
      }
    }, [setFilteredDiffFiles])

    const allFileDiffs = useMemo(() => {
      // Use pre-parsed files if provided (avoids duplicate parsing)
      if (initialParsedFiles && initialParsedFiles.length > 0) {
        return initialParsedFiles
      }
      // Fall back to parsing raw diff
      if (!diff) return []
      try {
        return splitUnifiedDiffByFile(diff)
      } catch {
        return []
      }
    }, [diff, initialParsedFiles])

    // Filter files if filteredDiffFiles is set (for sub-chat Review)
    // Use initialSelectedFile as fallback for first render before atom updates
    const effectiveFilter = filteredDiffFiles ?? (initialSelectedFile ? [initialSelectedFile] : null)

    const fileDiffs = useMemo(() => {
      // First, filter out invalid files without proper paths (file-N keys indicate parse failure)
      const validFiles = allFileDiffs.filter((file) => {
        // Skip files that failed to parse (have generic file-N keys and no real paths)
        if (file.key.startsWith('file-') && !file.oldPath && !file.newPath) {
          return false
        }
        // Also skip files with only /dev/null paths (shouldn't happen but be safe)
        if (file.oldPath === '/dev/null' && file.newPath === '/dev/null') {
          return false
        }
        return true
      })

      // Filter out /dev/null from filter paths (it's not a real file path)
      const validFilterPaths = effectiveFilter?.filter(p => p && p !== '/dev/null') || []

      if (validFilterPaths.length === 0) {
        return validFiles
      }
      // Filter to only show files matching the filter paths
      return validFiles.filter((file) => {
        // Use the actual file path (prefer newPath for new/modified, oldPath for deleted)
        const filePath = file.newPath !== '/dev/null' ? file.newPath : file.oldPath
        // Match by exact path or by path suffix (to handle sandbox path prefixes)
        return validFilterPaths.some(
          (filterPath) =>
            filePath === filterPath ||
            filePath.endsWith(filterPath) ||
            filterPath.endsWith(filePath),
        )
      })
    }, [allFileDiffs, effectiveFilter])

    // Handle discard confirmation
    const handleConfirmDiscard = useCallback(async () => {
      if (!discardFilePath || !worktreePath) return

      try {
        // Check if this is a new file (untracked) - needs delete instead of discard
        const file = fileDiffs.find(f => {
          const path = f.newPath !== "/dev/null" ? f.newPath : f.oldPath
          return path === discardFilePath
        })
        const isNewFile = file?.oldPath === "/dev/null"

        if (isNewFile) {
          await trpcClient.changes.deleteUntracked.mutate({ worktreePath, filePath: discardFilePath })
        } else {
          await trpcClient.changes.discardChanges.mutate({ worktreePath, filePath: discardFilePath })
        }
        toast.success("Changes discarded")
        // Refresh the diff
        handleRefresh()
      } catch (error) {
        toast.error(`Failed to discard: ${error instanceof Error ? error.message : "Unknown error"}`)
      } finally {
        setDiscardFilePath(null)
      }
    }, [discardFilePath, worktreePath, fileDiffs, handleRefresh])

    // Expand/collapse all functions - exposed via ref for parent control
    // Uses batched updates to avoid blocking UI with many files
    const expandAll = useCallback(() => {
      // For small number of files, expand all at once
      if (fileDiffs.length <= 10) {
        startTransition(() => {
          const expandedState: Record<string, boolean> = {}
          for (const file of fileDiffs) {
            expandedState[file.key] = false
          }
          setCollapsedByFileKey(expandedState)
        })
        return
      }

      // For many files, expand in batches to avoid UI freeze
      const BATCH_SIZE = 5
      let currentBatch = 0

      const expandBatch = () => {
        const start = currentBatch * BATCH_SIZE
        const end = Math.min(start + BATCH_SIZE, fileDiffs.length)

        if (start >= fileDiffs.length) return

        startTransition(() => {
          setCollapsedByFileKey((prev) => {
            const next = { ...prev }
            for (let i = start; i < end; i++) {
              const file = fileDiffs[i]
              if (file) next[file.key] = false
            }
            return next
          })
        })

        currentBatch++
        if (currentBatch * BATCH_SIZE < fileDiffs.length) {
          // Use requestAnimationFrame for next batch to allow UI to breathe
          requestAnimationFrame(() => setTimeout(expandBatch, 0))
        }
      }

      expandBatch()
    }, [fileDiffs])

    const collapseAll = useCallback(() => {
      // Collapse is fast - no batching needed
      startTransition(() => {
        const collapsedState: Record<string, boolean> = {}
        for (const file of fileDiffs) {
          collapsedState[file.key] = true
        }
        setCollapsedByFileKey(collapsedState)
      })
    }, [fileDiffs])

    // Check if all files are collapsed/expanded
    const isAllCollapsed = useCallback(() => {
      if (fileDiffs.length === 0) return true
      return fileDiffs.every((file) => collapsedByFileKey[file.key] === true)
    }, [fileDiffs, collapsedByFileKey])

    const isAllExpanded = useCallback(() => {
      if (fileDiffs.length === 0) return true
      return fileDiffs.every((file) => !collapsedByFileKey[file.key])
    }, [fileDiffs, collapsedByFileKey])

    // Get count of viewed files (with matching content hash)
    const getViewedCount = useCallback(() => {
      return fileDiffs.filter((file) => isFileViewed(file.key, file.diffText)).length
    }, [fileDiffs, isFileViewed])

    // Mark all files as viewed and collapse them
    const markAllViewed = useCallback(() => {
      const newViewedState: Record<string, ViewedFileState> = {}
      const newCollapsedState: Record<string, boolean> = {}
      for (const file of fileDiffs) {
        newViewedState[file.key] = {
          viewed: true,
          contentHash: hashString(file.diffText),
        }
        newCollapsedState[file.key] = true
      }
      setViewedFiles(newViewedState)
      setCollapsedByFileKey(newCollapsedState)
    }, [fileDiffs, setViewedFiles])

    // Mark all files as unviewed and expand them
    const markAllUnviewed = useCallback(() => {
      setViewedFiles({})
      const newCollapsedState: Record<string, boolean> = {}
      for (const file of fileDiffs) {
        newCollapsedState[file.key] = false
      }
      setCollapsedByFileKey(newCollapsedState)
    }, [setViewedFiles, fileDiffs])

    // Expose expand/collapse methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        expandAll,
        collapseAll,
        isAllCollapsed,
        isAllExpanded,
        getViewedCount,
        markAllViewed,
        markAllUnviewed,
      }),
      [expandAll, collapseAll, isAllCollapsed, isAllExpanded, getViewedCount, markAllViewed, markAllUnviewed],
    )

    // Notify parent when collapsed state changes
    const prevCollapseStateRef = useRef<{ allCollapsed: boolean; allExpanded: boolean } | null>(null)
    useEffect(() => {
      const newState = {
        allCollapsed: isAllCollapsed(),
        allExpanded: isAllExpanded(),
      }
      // Only notify if state actually changed
      if (
        prevCollapseStateRef.current?.allCollapsed !== newState.allCollapsed ||
        prevCollapseStateRef.current?.allExpanded !== newState.allExpanded
      ) {
        prevCollapseStateRef.current = newState
        onCollapsedStateChange?.(newState)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are stable, excluding to prevent loops
    }, [collapsedByFileKey, fileDiffs])

    // Notify parent when viewed count changes
    const prevViewedCountRef = useRef<number | null>(null)
    useEffect(() => {
      const count = getViewedCount()
      if (prevViewedCountRef.current !== count) {
        prevViewedCountRef.current = count
        onViewedCountChange?.(count)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are stable, excluding to prevent loops
    }, [fileDiffs, viewedFiles])

    // Auto-expand all files with lazy batching for performance
    // Track if we've already initialized the collapsed state for this set of files
    const prevFileKeysRef = useRef<string>("")
    const isExpandingRef = useRef(false)

    useEffect(() => {
      // Generate a unique key for the current file set
      const currentFileKeys = fileDiffs.map((f) => f.key).join(",")

      // Only update if the file set changed and we're not already expanding
      if (currentFileKeys !== prevFileKeysRef.current && !isExpandingRef.current) {
        prevFileKeysRef.current = currentFileKeys

        // For small number of files, expand all at once
        if (fileDiffs.length <= 10) {
          startTransition(() => {
            const expandedState: Record<string, boolean> = {}
            for (const file of fileDiffs) {
              expandedState[file.key] = false
            }
            setCollapsedByFileKey(expandedState)
          })
          return
        }

        // For many files, expand in batches to avoid UI freeze
        isExpandingRef.current = true
        const BATCH_SIZE = 5
        let currentBatch = 0

        const expandBatch = () => {
          const start = currentBatch * BATCH_SIZE
          const end = Math.min(start + BATCH_SIZE, fileDiffs.length)

          if (start >= fileDiffs.length) {
            isExpandingRef.current = false
            return
          }

          startTransition(() => {
            setCollapsedByFileKey((prev) => {
              const next = { ...prev }
              for (let i = start; i < end; i++) {
                const file = fileDiffs[i]
                if (file) next[file.key] = false
              }
              return next
            })
          })

          currentBatch++
          if (currentBatch * BATCH_SIZE < fileDiffs.length) {
            // Use requestAnimationFrame for next batch to allow UI to breathe
            requestAnimationFrame(() => setTimeout(expandBatch, 0))
          } else {
            isExpandingRef.current = false
          }
        }

        expandBatch()
      }
    }, [fileDiffs])

    const diffViewDataByKey = useMemo(() => {
      const langMap: Record<string, string> = {
        ts: "typescript",
        tsx: "typescript",
        js: "javascript",
        jsx: "javascript",
        css: "css",
        json: "json",
        md: "markdown",
        html: "html",
      }
      const record: Record<string, DiffViewData> = {}
      for (const file of fileDiffs) {
        // Use server-provided flags if available, otherwise detect from paths
        const isNewFile = file.isNewFile ?? file.oldPath === "/dev/null"
        const isDeletedFile = file.isDeletedFile ?? file.newPath === "/dev/null"

        // Use server-provided fileLang if available, otherwise detect from extension
        let fileLang = file.fileLang
        if (fileLang === undefined) {
          const actualPath = isNewFile
            ? file.newPath
            : isDeletedFile
              ? file.oldPath
              : file.newPath || file.oldPath
          const ext = (actualPath || "").split(".").pop()?.toLowerCase() || ""
          fileLang = langMap[ext] || ext || null
        }

        // PURE DIFF MODE: Always use null for content to avoid mismatch warnings
        // The @git-diff-view library validates content against diff when content is provided,
        // but the working directory may have changed since the diff was generated,
        // causing expensive validation warnings that block the UI thread.
        // Using null for both old/new content enables pure diff mode where the library
        // only renders the diff hunks without validation.

        // Normalize diff text: ensure proper ending for the parser
        // The library fails on diffs that end with just "+" or "-" (empty line changes)
        let normalizedDiff = file.diffText
        // Remove trailing empty lines that might confuse the parser
        normalizedDiff = normalizedDiff.replace(/\n+$/, '\n')
        // If diff ends with an empty addition/deletion line, add a newline marker
        if (normalizedDiff.endsWith('\n+\n') || normalizedDiff.endsWith('\n-\n')) {
          normalizedDiff = normalizedDiff.slice(0, -1)
        }
        // Handle case where diff ends with just + or - on last line
        const lines = normalizedDiff.split('\n')
        const lastLine = lines[lines.length - 1]
        if (lastLine === '+' || lastLine === '-') {
          lines[lines.length - 1] = lastLine + ' '
          normalizedDiff = lines.join('\n')
        }

        record[file.key] = {
          oldFile: {
            fileName: isNewFile ? null : file.oldPath || null,
            fileLang,
            content: null, // Pure diff mode - no validation
          },
          newFile: {
            fileName: isDeletedFile ? null : file.newPath || null,
            fileLang,
            content: null, // Pure diff mode - no validation
          },
          hunks: [normalizedDiff],
        }
      }
      return record
    }, [fileDiffs])

    // Use deferred value for diff data to prevent UI blocking during tab switches
    // This allows the tab change to happen immediately while diff rendering is deferred
    const deferredDiffViewData = useDeferredValue(diffViewDataByKey)
    const deferredFileDiffs = useDeferredValue(fileDiffs)
    const isDiffStale = deferredFileDiffs !== fileDiffs

    // Pre-fetch file contents when diff is loaded (for expand functionality)
    // Delayed to allow UI to render first, then fetch in background
    // Limited to prevent overwhelming the system with too many parallel requests
    const MAX_PREFETCH_FILES = 20

    useEffect(() => {
      // Desktop: use worktreePath, Web: use sandboxId
      if (fileDiffs.length === 0 || isLoadingFileContents) return
      if (!worktreePath && !sandboxId) return
      // Skip if we already have enough contents
      const existingContentCount = Object.keys(fileContents).length
      if (
        existingContentCount >= Math.min(fileDiffs.length, MAX_PREFETCH_FILES)
      )
        return

      const fetchAllContents = async () => {
        setIsLoadingFileContents(true)

        try {
          // Limit files to prefetch to prevent overwhelming the system
          const filesToProcess = fileDiffs.slice(0, MAX_PREFETCH_FILES)

          // Build list of files to fetch (filter out /dev/null)
          const filesToFetch = filesToProcess
            .map((file) => {
              const filePath =
                file.newPath && file.newPath !== "/dev/null"
                  ? file.newPath
                  : file.oldPath
              if (!filePath || filePath === "/dev/null") return null
              return { key: file.key, filePath }
            })
            .filter((f): f is { key: string; filePath: string } => f !== null)

          if (filesToFetch.length === 0) {
            setIsLoadingFileContents(false)
            return
          }

          // Desktop: use batch tRPC call
          if (worktreePath) {
            const results =
              await trpcClient.changes.readMultipleWorkingFiles.query({
                worktreePath,
                files: filesToFetch,
              })

            const newContents: Record<string, string> = {}
            for (const [key, result] of Object.entries(results)) {
              if (result.ok) {
                newContents[key] = result.content
              }
            }
            setFileContents(newContents)
          } else if (sandboxId) {
            // Web fallback: use sandbox API (still individual calls for web)
            const results = await Promise.allSettled(
              filesToFetch.map(async ({ key, filePath }) => {
                const response = await Promise.race([
                  fetch(
                    `/api/agents/sandbox/${sandboxId}/files?path=${encodeURIComponent(filePath)}`,
                  ),
                  new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 5000),
                  ),
                ])
                if (!response.ok) throw new Error("Failed to fetch file")
                const data = await response.json()
                return { key, content: data.content }
              }),
            )

            const newContents: Record<string, string> = {}
            for (const result of results) {
              if (result.status === "fulfilled" && result.value?.content) {
                newContents[result.value.key] = result.value.content
              }
            }
            setFileContents(newContents)
          }
        } catch (error) {
          console.error("Failed to prefetch file contents:", error)
        } finally {
          setIsLoadingFileContents(false)
        }
      }

      fetchAllContents()
    }, [fileDiffs, sandboxId, worktreePath]) // Note: fileContents intentionally not in deps

    const toggleFileCollapsed = useCallback((fileKey: string) => {
      setCollapsedByFileKey((prev) => ({
        ...prev,
        [fileKey]: !prev[fileKey],
      }))
    }, [])

    const toggleFileFullExpanded = useCallback((fileKey: string) => {
      setFullExpandedByFileKey((prev) => ({
        ...prev,
        [fileKey]: !prev[fileKey],
      }))
    }, [])

    // Virtualizer for efficient rendering of many files
    // Use deferred file list to prevent UI blocking during updates
    const virtualizer = useVirtualizer({
      count: deferredFileDiffs.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index) => {
        const file = deferredFileDiffs[index]
        if (!file) return COLLAPSED_HEIGHT
        const isCollapsed = !!collapsedByFileKey[file.key]
        if (isCollapsed) {
          return COLLAPSED_HEIGHT
        }
        // Estimate based on line count
        const lineCount = file.additions + file.deletions
        return Math.min(Math.max(lineCount * 22 + COLLAPSED_HEIGHT, 150), 800)
      },
      overscan: 3, // Reduced overscan for better initial render performance
    })

    // Toggle viewed state for a file
    // When marking as viewed, auto-navigate to the next UNVIEWED file
    // Uses allFileDiffs (unfiltered list) for navigation since filtered list may only contain current file
    const handleToggleViewed = useCallback((fileKey: string, diffText: string) => {
      const currentHash = hashString(diffText)
      const isCurrentlyViewed = isFileViewed(fileKey, diffText)
      const willBeViewed = !isCurrentlyViewed

      // Save to undo stack before changing
      viewedUndoStackRef.current.push({
        fileKey,
        previousState: viewedFiles[fileKey],
      })
      // Limit undo stack size to 50
      if (viewedUndoStackRef.current.length > 50) {
        viewedUndoStackRef.current.shift()
      }

      // Build new viewed state
      const newViewedFiles = {
        ...viewedFiles,
        [fileKey]: {
          viewed: willBeViewed,
          contentHash: currentHash,
        },
      }
      setViewedFiles(newViewedFiles)

      // Helper to check if file is viewed using new state (not stale closure)
      const isFileViewedWithNewState = (fKey: string, fDiffText: string): boolean => {
        const viewedState = newViewedFiles[fKey]
        if (!viewedState?.viewed) return false
        return viewedState.contentHash === hashString(fDiffText)
      }

      // When marking as viewed, find and select next UNVIEWED file
      // Use allFileDiffs (unfiltered) for navigation, since filtered list may only show current file
      if (willBeViewed && onSelectNextFile) {
        const currentIndex = allFileDiffs.findIndex((f) => f.key === fileKey)
        if (currentIndex === -1) return

        // Find next unviewed file after current position
        let nextUnviewedFile: ParsedDiffFile | null = null
        for (let i = currentIndex + 1; i < allFileDiffs.length; i++) {
          const file = allFileDiffs[i]
          if (file && !isFileViewedWithNewState(file.key, file.diffText)) {
            nextUnviewedFile = file
            break
          }
        }

        // If no unviewed file found after current, wrap around and search from beginning
        if (!nextUnviewedFile) {
          for (let i = 0; i < currentIndex; i++) {
            const file = allFileDiffs[i]
            if (file && !isFileViewedWithNewState(file.key, file.diffText)) {
              nextUnviewedFile = file
              break
            }
          }
        }

        // If found an unviewed file, select it
        if (nextUnviewedFile) {
          // Get the actual file path (newPath for new/modified files, oldPath for deleted files)
          const filePath = nextUnviewedFile.newPath && nextUnviewedFile.newPath !== "/dev/null"
            ? nextUnviewedFile.newPath
            : nextUnviewedFile.oldPath
          if (filePath && filePath !== "/dev/null") {
            // Select next file - this will update the filter and diff view
            onSelectNextFile(filePath)
          }
        }
        // If all files are viewed, do nothing (stay where we are)
      }
    }, [isFileViewed, setViewedFiles, viewedFiles, allFileDiffs, onSelectNextFile])

    // Undo last viewed action
    const undoLastViewed = useCallback(() => {
      const lastAction = viewedUndoStackRef.current.pop()
      if (!lastAction) return false

      const { fileKey, previousState } = lastAction
      if (previousState === undefined) {
        // File wasn't in viewedFiles before - remove it
        const newViewedFiles = { ...viewedFiles }
        delete newViewedFiles[fileKey]
        setViewedFiles(newViewedFiles)
      } else {
        // Restore previous state
        setViewedFiles({
          ...viewedFiles,
          [fileKey]: previousState,
        })
      }

      // Navigate back to the file that was undone
      const file = allFileDiffs.find((f) => f.key === fileKey)
      if (file && onSelectNextFile) {
        const filePath = file.newPath && file.newPath !== "/dev/null"
          ? file.newPath
          : file.oldPath
        if (filePath && filePath !== "/dev/null") {
          onSelectNextFile(filePath)
        }
      }

      return true
    }, [viewedFiles, setViewedFiles, allFileDiffs, onSelectNextFile])

    // Use ALL files for stats, not filtered ones (to avoid overwriting parent's stats when filtering)
    const totalAdditions = allFileDiffs.reduce((sum, f) => sum + f.additions, 0)
    const totalDeletions = allFileDiffs.reduce((sum, f) => sum + f.deletions, 0)

    // Report stats to parent - only when we have actual data and NO filter active
    // When filtering is active, parent already has correct stats from fetchDiffStats
    const prevStatsRef = useRef<{ fileCount: number; additions: number; deletions: number; isLoading: boolean } | null>(null)
    useEffect(() => {
      // Don't report stats when filtering is active - parent already has correct totals
      if (filteredDiffFiles && filteredDiffFiles.length > 0) {
        return
      }
      if (allFileDiffs.length === 0 && !isLoadingDiff) {
        // Don't report empty stats - let parent's fetchDiffStats be the source of truth
        return
      }
      // Only notify if stats actually changed
      if (
        prevStatsRef.current?.fileCount === allFileDiffs.length &&
        prevStatsRef.current?.additions === totalAdditions &&
        prevStatsRef.current?.deletions === totalDeletions &&
        prevStatsRef.current?.isLoading === isLoadingDiff
      ) {
        return
      }
      prevStatsRef.current = {
        fileCount: allFileDiffs.length,
        additions: totalAdditions,
        deletions: totalDeletions,
        isLoading: isLoadingDiff,
      }
      onStatsChange?.({
        fileCount: allFileDiffs.length,
        additions: totalAdditions,
        deletions: totalDeletions,
        isLoading: isLoadingDiff,
        hasChanges: allFileDiffs.length > 0,
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onStatsChange is stable setState, excluding to prevent loops
    }, [
      allFileDiffs.length,
      totalAdditions,
      totalDeletions,
      isLoadingDiff,
      filteredDiffFiles,
    ])

    // Scroll to focused file when atom changes (works with virtualized list)
    useEffect(() => {
      if (!focusedDiffFile || isLoadingDiff) {
        return
      }

      // Find the file index in the list
      let fileIndex = -1

      // Try exact match first
      fileIndex = fileDiffs.findIndex(
        (f) => f.newPath === focusedDiffFile || f.oldPath === focusedDiffFile,
      )

      // If not found, try matching by file ending
      if (fileIndex === -1) {
        fileIndex = fileDiffs.findIndex((f) => {
          const path = f.newPath || f.oldPath || ""
          return (
            path.endsWith(focusedDiffFile) || focusedDiffFile.endsWith(path)
          )
        })
      }

      if (fileIndex >= 0) {
        // Expand the file if it's collapsed first
        const file = fileDiffs[fileIndex]
        if (file && collapsedByFileKey[file.key]) {
          setCollapsedByFileKey((prev) => ({
            ...prev,
            [file.key]: false,
          }))
        }

        // Use virtualizer's scrollToIndex for proper scrolling
        virtualizer.scrollToIndex(fileIndex, { align: "start" })

        // Add highlight effect after scroll completes
        setTimeout(() => {
          const container = scrollContainerRef.current
          if (container) {
            const fileCard = container.querySelector(
              `[data-diff-file-path="${focusedDiffFile}"]`,
            ) as HTMLElement | null

            if (fileCard) {
              fileCard.style.transition = "box-shadow 0.3s ease"
              fileCard.style.boxShadow =
                "0 0 0 2px hsl(var(--primary)), 0 0 12px hsl(var(--primary) / 0.3)"
              setTimeout(() => {
                fileCard.style.boxShadow = ""
              }, 1500)
            }
          }
        }, 100)
      }

      // Clear the focused file atom
      setFocusedDiffFile(null)
    }, [
      focusedDiffFile,
      isLoadingDiff,
      setFocusedDiffFile,
      fileDiffs,
      collapsedByFileKey,
    ])

    // Keyboard shortcut: V to mark current file as viewed
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Use e.code for physical key position (works with any keyboard layout)
        if (e.code !== "KeyV") return
        if (e.metaKey || e.ctrlKey || e.altKey) return

        // Don't trigger if typing in input/textarea
        const target = e.target as HTMLElement
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return
        }

        // Find currently visible file and toggle its viewed state
        // Use the first visible file in the virtualizer viewport
        const visibleItems = virtualizer.getVirtualItems()
        if (visibleItems.length === 0) return

        const firstVisibleIndex = visibleItems[0]?.index ?? -1
        if (firstVisibleIndex < 0) return

        const file = deferredFileDiffs[firstVisibleIndex]
        if (file) {
          e.preventDefault()
          handleToggleViewed(file.key, file.diffText)
        }
      }

      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [virtualizer, deferredFileDiffs, handleToggleViewed])

    // Keyboard shortcut: Cmd+Z to undo last viewed action
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Use e.code for physical key position (works with any keyboard layout)
        if (e.code !== "KeyZ") return
        if (!e.metaKey || e.shiftKey || e.altKey) return // Only Cmd+Z, not Cmd+Shift+Z

        // Don't trigger if typing in input/textarea
        const target = e.target as HTMLElement
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return
        }

        // Try to undo - if successful, prevent default
        if (undoLastViewed()) {
          e.preventDefault()
          e.stopPropagation()
        }
      }

      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }, [undoLastViewed])

    if (!isHydrated) {
      return (
        <div className="flex h-full items-center justify-center">
          <IconSpinner className="w-4 h-4" />
        </div>
      )
    }

    return (
      <div
        className={cn(
          "flex flex-col bg-background overflow-hidden min-w-0",
          isMobile ? "h-full w-full" : "h-full",
        )}
      >
        {/* Mobile Header */}
        {isMobile && (
          <div
            className="flex-shrink-0 bg-background/95 backdrop-blur border-b h-11 min-h-[44px] max-h-[44px]"
            data-mobile-diff-header
            style={{
              // @ts-expect-error - WebKit-specific property for Electron window dragging
              WebkitAppRegion: "drag",
            }}
          >
            <div
              className="flex h-full items-center px-2 gap-2"
              style={{
                // @ts-expect-error - WebKit-specific property
                WebkitAppRegion: "no-drag",
              }}
            >
              {/* Back to chat button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="h-7 w-7 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0 rounded-md"
              >
                <IconChatBubble className="h-4 w-4" />
                <span className="sr-only">Back to chat</span>
              </Button>

              {/* Stats - centered */}
              <div className="flex-1 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {!isLoadingDiff && fileDiffs.length > 0 && (
                  <>
                    <span className="font-mono">
                      {fileDiffs.length} file{fileDiffs.length !== 1 ? "s" : ""}
                    </span>
                    {(totalAdditions > 0 || totalDeletions > 0) && (
                      <>
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{totalAdditions}
                        </span>
                        <span className="text-red-600 dark:text-red-400">
                          -{totalDeletions}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Split/Unified toggle */}
              <div className="relative bg-muted rounded-md h-7 p-0.5 flex">
                <div
                  className="absolute inset-y-0.5 rounded bg-background shadow transition-all duration-200 ease-in-out"
                  style={{
                    width: "calc(50% - 2px)",
                    left: diffMode === DiffModeEnum.Split ? "2px" : "calc(50%)",
                  }}
                />
                <button
                  onClick={() => setDiffMode(DiffModeEnum.Split)}
                  className="relative z-[2] px-1.5 flex items-center justify-center transition-colors duration-200 rounded text-muted-foreground"
                  title="Split view"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDiffMode(DiffModeEnum.Unified)}
                  className="relative z-[2] px-1.5 flex items-center justify-center transition-colors duration-200 rounded text-muted-foreground"
                  title="Unified view"
                >
                  <Rows2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div
          ref={scrollContainerRef}
          className="relative flex-1 overflow-auto p-2 select-text"
        >
          {/* Sticky cover to hide content scrolling above cards */}
          <div
            className="sticky top-0 left-0 right-0 h-0 z-20 pointer-events-none"
            aria-hidden="true"
          >
            <div className="absolute -top-2 left-0 right-0 h-2 bg-background" />
          </div>


          {isLoadingDiff ||
          (isLoadingFileContents && fileDiffs.length === 0) ? (
            <div className="flex items-center justify-center h-full">
              <IconSpinner className="w-4 h-4" />
            </div>
          ) : diffError ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <p className="text-sm text-red-500 mb-2">{diffError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Try again
              </Button>
            </div>
          ) : deferredFileDiffs.length > 0 ? (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
                // Show visual feedback when diff is being updated
                opacity: isDiffStale ? 0.7 : 1,
                transition: "opacity 150ms ease-out",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const file = deferredFileDiffs[virtualRow.index]!
                const data = deferredDiffViewData[file.key]
                // Skip rendering if data not ready (during deferred update)
                if (!data) return null
                return (
                  <div
                    key={file.key}
                    data-index={virtualRow.index}
                    ref={virtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div className="pb-2">
                      <FileDiffCard
                        file={file}
                        data={data}
                        isLight={isLight}
                        isCollapsed={!!collapsedByFileKey[file.key]}
                        toggleCollapsed={toggleFileCollapsed}
                        isFullExpanded={!!fullExpandedByFileKey[file.key]}
                        toggleFullExpanded={toggleFileFullExpanded}
                        hasContent={!!fileContents[file.key]}
                        isLoadingContent={isLoadingFileContents}
                        diffMode={diffMode}
                        shikiHighlighter={shikiHighlighter}
                        worktreePath={worktreePath}
                        onDiscardFile={handleDiscardFile}
                        isViewed={isFileViewed(file.key, file.diffText)}
                        onToggleViewed={handleToggleViewed}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm px-4 text-center h-full">
              No changes detected
            </div>
          )}
        </div>

        {/* Discard confirmation dialog */}
        <AlertDialog open={!!discardFilePath} onOpenChange={(open) => !open && setDiscardFilePath(null)}>
          <AlertDialogContent className="w-[340px]">
            <AlertDialogHeader>
              <AlertDialogTitle>
                Discard changes to "{discardFilePath?.split("/").pop()}"?
              </AlertDialogTitle>
            </AlertDialogHeader>
            <AlertDialogDescription className="px-5 pb-5">
              This will revert all changes to this file. This action cannot be undone.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDiscardFilePath(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleConfirmDiscard}
              >
                Discard
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  },
)
