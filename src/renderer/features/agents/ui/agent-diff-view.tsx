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
  type ReactNode,
  type ErrorInfo,
} from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { atomWithStorage } from "jotai/utils"
import { agentsFocusedDiffFileAtom, filteredDiffFilesAtom, diffListModeAtom } from "../atoms"
import { DiffModeEnum, DiffView, DiffFile } from "@git-diff-view/react"
import "@git-diff-view/react/styles/diff-view-pure.css"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Columns2,
  Rows2,
  List,
  FolderTree,
} from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { getFileIconByExtension } from "../mentions/agents-file-mention"
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

// Error Boundary for DiffView to catch parsing errors
interface DiffErrorBoundaryProps {
  children: ReactNode
  fileName: string
}

interface DiffErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class DiffErrorBoundary extends Component<
  DiffErrorBoundaryProps,
  DiffErrorBoundaryState
> {
  constructor(props: DiffErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): DiffErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Error already captured in state, no need to log
  }

  render() {
    if (this.state.hasError) {
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

export type ParsedDiffFile = {
  key: string
  oldPath: string
  newPath: string
  diffText: string
  isBinary: boolean
  additions: number
  deletions: number
  isValid?: boolean // Whether the diff format is valid/complete
}

// Tree structure for hierarchical diff view
export interface DiffFileTreeNode {
  id: string              // Unique path identifier
  name: string            // Display name (folder or file name)
  type: "file" | "folder"
  path: string            // Full path
  depth: number           // Nesting level for indentation
  additions: number       // Aggregated for folders
  deletions: number       // Aggregated for folders
  fileCount: number       // Total files in folder (recursive)
  file?: ParsedDiffFile   // For files only
  children?: DiffFileTreeNode[] // For folders only
}

// Flattened row for virtualizer
export type FlatDiffRow =
  | { type: "folder"; node: DiffFileTreeNode; isExpanded: boolean }
  | { type: "file"; node: DiffFileTreeNode; file: ParsedDiffFile }

// View mode for diff list
export type DiffListMode = "flat" | "tree"

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
}

// Custom comparator to prevent unnecessary re-renders
const fileDiffCardAreEqual = (
  prev: FileDiffCardProps,
  next: FileDiffCardProps,
): boolean => {
  // Key comparison - file identity
  if (prev.file.key !== next.file.key) return false
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
  return true
}

// ============ DIFF FOLDER ROW COMPONENT ============

interface DiffFolderRowProps {
  node: DiffFileTreeNode
  isExpanded: boolean
  onToggle: () => void
}

const DiffFolderRow = memo(function DiffFolderRow({
  node,
  isExpanded,
  onToggle,
}: DiffFolderRowProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-2 cursor-pointer hover:bg-accent/50 transition-colors bg-muted/30 border-b border-border/50"
      onClick={onToggle}
      style={{ paddingLeft: `${12 + node.depth * 16}px` }}
    >
      {/* Chevron */}
      <ChevronDown
        className={cn(
          "w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0",
          !isExpanded && "-rotate-90"
        )}
      />

      {/* Folder icon */}
      <svg
        className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>

      {/* Folder name */}
      <span className="flex-1 font-mono text-xs truncate">{node.name}</span>

      {/* File count badge */}
      <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded-full">
        {node.fileCount} file{node.fileCount !== 1 ? "s" : ""}
      </span>

      {/* Aggregated statistics */}
      <span className="font-mono text-[11px] tabular-nums whitespace-nowrap">
        {node.additions > 0 && (
          <span className="mr-1.5 text-emerald-600 dark:text-emerald-400">
            +{node.additions}
          </span>
        )}
        {node.deletions > 0 && (
          <span className="text-red-600 dark:text-red-400">
            -{node.deletions}
          </span>
        )}
      </span>
    </div>
  )
})

// ============ FILE DIFF CARD COMPONENT ============

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
}: FileDiffCardProps) {
  const diffViewRef = useRef<{ getDiffFileInstance: () => DiffFile } | null>(
    null,
  )
  const diffCardRef = useRef<HTMLDivElement>(null)
  const prevExpandedRef = useRef(isFullExpanded)

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

  return (
    <div
      ref={diffCardRef}
      className="bg-background rounded-lg border border-border overflow-clip"
      data-diff-file-path={file.newPath || file.oldPath}
    >
      <header
        className={cn(
          "group px-3 py-1 font-mono text-xs bg-muted cursor-pointer",
          // Note: sticky doesn't work with virtualization (absolute positioning)
          // Headers scroll with content like in VS Code
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
        <div className="flex items-center gap-3">
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
              <span className="font-medium text-foreground truncate">
                {fileName}
              </span>
              {dirPath && (
                <span className="text-muted-foreground truncate text-[11px]">
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
        </div>
      </header>

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
              <DiffErrorBoundary fileName={file.newPath || file.oldPath}>
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
}

// ============ TREE VIEW HELPERS ============

/**
 * Build a hierarchical tree from flat file list with aggregated statistics
 * Adapted from FileListTree.tsx buildFileTree() pattern
 */
function buildDiffFileTree(files: ParsedDiffFile[]): DiffFileTreeNode[] {
  type TreeNodeInternal = Omit<DiffFileTreeNode, "children"> & {
    children?: Record<string, TreeNodeInternal>
  }

  const root: Record<string, TreeNodeInternal> = {}

  // Build tree structure with stats accumulation
  for (const file of files) {
    const displayPath = file.newPath !== "/dev/null" ? file.newPath : file.oldPath
    const parts = displayPath.split("/")
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const pathSoFar = parts.slice(0, i + 1).join("/")

      if (!current[part]) {
        current[part] = {
          id: pathSoFar,
          name: part,
          type: isLast ? "file" : "folder",
          path: pathSoFar,
          depth: i,
          additions: 0,
          deletions: 0,
          fileCount: 0,
          file: isLast ? file : undefined,
          children: isLast ? undefined : {},
        }
      }

      // Accumulate statistics up the tree
      current[part].additions += file.additions
      current[part].deletions += file.deletions

      if (!isLast && current[part].children) {
        current = current[part].children!
      }
    }
  }

  // Convert to sorted array with file counts
  function convertToArray(
    nodes: Record<string, TreeNodeInternal>,
    depth: number = 0
  ): DiffFileTreeNode[] {
    return Object.values(nodes)
      .map((node) => {
        const children = node.children
          ? convertToArray(node.children, depth + 1)
          : undefined

        const fileCount = children
          ? children.reduce((sum, c) => sum + c.fileCount, 0)
          : 1

        return {
          ...node,
          depth,
          fileCount,
          children,
        } as DiffFileTreeNode
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  return convertToArray(root)
}

/**
 * Flatten tree to array for virtualizer, respecting folder collapse state
 */
function flattenTreeForVirtualizer(
  tree: DiffFileTreeNode[],
  expandedFolders: Set<string>
): FlatDiffRow[] {
  const result: FlatDiffRow[] = []

  function traverse(nodes: DiffFileTreeNode[]) {
    for (const node of nodes) {
      if (node.type === "folder") {
        const isExpanded = expandedFolders.has(node.id)
        result.push({ type: "folder", node, isExpanded })

        if (isExpanded && node.children) {
          traverse(node.children)
        }
      } else if (node.file) {
        result.push({ type: "file", node, file: node.file })
      }
    }
  }

  traverse(tree)
  return result
}

/** Ref handle for controlling AgentDiffView from parent */
export interface AgentDiffViewRef {
  expandAll: () => void
  collapseAll: () => void
  isAllCollapsed: () => boolean
  isAllExpanded: () => boolean
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

    // Load shiki highlighter on mount
    useEffect(() => {
      let cancelled = false
      getDiffHighlighter()
        .then((highlighter) => {
          if (!cancelled) {
            setShikiHighlighter(highlighter)
          }
        })
        .catch((err) => {
          console.error("Failed to load diff highlighter:", err)
        })
      return () => {
        cancelled = true
      }
    }, [])

    const [diff, setDiff] = useState<string | null>(initialDiff ?? null)
    // Loading if initialDiff not provided, or if it's null AND no parsed files (parent still loading)
    const [isLoadingDiff, setIsLoadingDiff] = useState(
      initialDiff === undefined ||
        (initialDiff === null &&
          (!initialParsedFiles || initialParsedFiles.length === 0)),
    )
    const [diffError, setDiffError] = useState<string | null>(null)
    const [collapsedByFileKey, setCollapsedByFileKey] = useState<
      Record<string, boolean>
    >({})
    const [fullExpandedByFileKey, setFullExpandedByFileKey] = useState<
      Record<string, boolean>
    >({})
    const [diffMode, setDiffMode] = useAtom(diffViewModeAtom)
    const [listMode, setListMode] = useAtom(diffListModeAtom)

    // Tree view: folder collapse state
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set())

    const toggleFolder = useCallback((folderId: string) => {
      setExpandedFolders((prev) => {
        const next = new Set(prev)
        if (next.has(folderId)) {
          next.delete(folderId)
        } else {
          next.add(folderId)
        }
        return next
      })
    }, [])

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
        // Only mark as not loading if we have actual data or explicit empty diff
        // If initialDiff is null and no parsed files, parent is still loading
        const parentStillLoading =
          initialDiff === null &&
          (!initialParsedFiles || initialParsedFiles.length === 0)
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

    // Clear filter when component unmounts
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
    const fileDiffs = useMemo(() => {
      if (!filteredDiffFiles || filteredDiffFiles.length === 0) {
        return allFileDiffs
      }
      // Filter to only show files matching the filter paths
      return allFileDiffs.filter((file) => {
        const filePath = file.newPath || file.oldPath
        // Match by exact path or by path suffix (to handle sandbox path prefixes)
        return filteredDiffFiles.some(
          (filterPath) =>
            filePath === filterPath ||
            filePath.endsWith(filterPath) ||
            filterPath.endsWith(filePath),
        )
      })
    }, [allFileDiffs, filteredDiffFiles])

    // Build tree structure if in tree mode
    const diffTree = useMemo(() => {
      if (listMode === "flat") return null
      return buildDiffFileTree(fileDiffs)
    }, [fileDiffs, listMode])

    // Flatten tree for virtualizer (respects folder collapse state)
    const flatRows = useMemo(() => {
      if (listMode === "flat" || !diffTree) {
        // Flat mode: wrap files in flat row format
        return fileDiffs.map((file) => ({
          type: "file" as const,
          node: {
            id: file.key,
            name: file.newPath || file.oldPath,
            type: "file" as const,
            path: file.newPath || file.oldPath,
            depth: 0,
            additions: file.additions,
            deletions: file.deletions,
            fileCount: 1,
            file,
          },
          file,
        }))
      }
      return flattenTreeForVirtualizer(diffTree, expandedFolders)
    }, [diffTree, expandedFolders, fileDiffs, listMode])

    // Threshold for auto-collapsing files
    const AUTO_COLLAPSE_THRESHOLD = 10

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

    // Expose expand/collapse methods to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        expandAll,
        collapseAll,
        isAllCollapsed,
        isAllExpanded,
      }),
      [expandAll, collapseAll, isAllCollapsed, isAllExpanded],
    )

    // Notify parent when collapsed state changes
    useEffect(() => {
      onCollapsedStateChange?.({
        allCollapsed: isAllCollapsed(),
        allExpanded: isAllExpanded(),
      })
    }, [
      collapsedByFileKey,
      fileDiffs,
      onCollapsedStateChange,
      isAllCollapsed,
      isAllExpanded,
    ])

    // Auto-collapse all files when there are many files (performance optimization)
    // Track if we've already initialized the collapsed state for this set of files
    const prevFileKeysRef = useRef<string>("")
    useEffect(() => {
      // Generate a unique key for the current file set
      const currentFileKeys = fileDiffs.map((f) => f.key).join(",")

      // Only update if the file set changed
      if (currentFileKeys !== prevFileKeysRef.current) {
        prevFileKeysRef.current = currentFileKeys

        if (fileDiffs.length > AUTO_COLLAPSE_THRESHOLD) {
          // Collapse all files when there are many
          const collapsedState: Record<string, boolean> = {}
          for (const file of fileDiffs) {
            collapsedState[file.key] = true
          }
          setCollapsedByFileKey(collapsedState)
        } else {
          // Reset to expanded for smaller diffs
          setCollapsedByFileKey({})
        }
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
        // Handle /dev/null cases (new files or deleted files)
        const isNewFile = file.oldPath === "/dev/null"
        const isDeletedFile = file.newPath === "/dev/null"

        const actualPath = isNewFile
          ? file.newPath
          : isDeletedFile
            ? file.oldPath
            : file.newPath || file.oldPath
        const ext = (actualPath || "").split(".").pop()?.toLowerCase() || ""
        const fileLang = langMap[ext] || ext || null

        record[file.key] = {
          oldFile: {
            fileName: isNewFile ? null : file.oldPath || null,
            fileLang,
            // For new files, old content is empty
            content: isNewFile ? "" : undefined,
          },
          newFile: {
            fileName: isDeletedFile ? null : file.newPath || null,
            fileLang,
            // For deleted files, new content is empty
            content: isDeletedFile ? "" : fileContents[file.key] || null,
          },
          hunks: [file.diffText],
        }
      }
      return record
    }, [fileDiffs, fileContents])

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
    const FOLDER_ROW_HEIGHT = 36
    const virtualizer = useVirtualizer({
      count: flatRows.length,
      getScrollElement: () => scrollContainerRef.current,
      estimateSize: (index) => {
        const row = flatRows[index]
        if (!row) return COLLAPSED_HEIGHT

        // Folder row: fixed height
        if (row.type === "folder") {
          return FOLDER_ROW_HEIGHT
        }

        // File row: check if collapsed
        const isCollapsed = !!collapsedByFileKey[row.file.key]
        if (isCollapsed) {
          return COLLAPSED_HEIGHT
        }
        // Estimate based on line count
        const lineCount = row.file.additions + row.file.deletions
        return Math.min(Math.max(lineCount * 22 + COLLAPSED_HEIGHT, 150), 800)
      },
      overscan: 5,
    })

    const totalAdditions = fileDiffs.reduce((sum, f) => sum + f.additions, 0)
    const totalDeletions = fileDiffs.reduce((sum, f) => sum + f.deletions, 0)

    // Report stats to parent
    useEffect(() => {
      onStatsChange?.({
        fileCount: fileDiffs.length,
        additions: totalAdditions,
        deletions: totalDeletions,
        isLoading: isLoadingDiff,
        hasChanges: Boolean(diff && diff.trim()),
      })
    }, [
      fileDiffs.length,
      totalAdditions,
      totalDeletions,
      isLoadingDiff,
      diff,
      onStatsChange,
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

    if (!isHydrated) {
      return (
        <div className="flex h-full items-center justify-center">
          <IconSpinner className="w-6 h-6" />
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

              {/* Tree/Flat view toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() => setListMode(listMode === "flat" ? "tree" : "flat")}
                  >
                    {listMode === "flat" ? (
                      <FolderTree className="h-3.5 w-3.5" />
                    ) : (
                      <List className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {listMode === "flat" ? "Switch to tree view" : "Switch to flat view"}
                </TooltipContent>
              </Tooltip>

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

          {/* Filter indicator when showing sub-chat files */}
          {filteredDiffFiles && filteredDiffFiles.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5 mb-2 rounded-md bg-primary/10 border border-primary/20">
              <span className="text-xs text-primary">
                Showing {fileDiffs.length} of {allFileDiffs.length} files from
                this chat
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilteredDiffFiles(null)}
                className="h-5 px-2 text-xs text-primary hover:text-primary"
              >
                Show all
              </Button>
            </div>
          )}

          {isLoadingDiff ||
          (isLoadingFileContents && fileDiffs.length === 0) ? (
            <div className="flex items-center justify-center h-full">
              <IconSpinner className="w-6 h-6" />
            </div>
          ) : diffError ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <p className="text-sm text-red-500 mb-2">{diffError}</p>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                Try again
              </Button>
            </div>
          ) : fileDiffs.length > 0 ? (
            <div
              style={{
                height: virtualizer.getTotalSize(),
                width: "100%",
                position: "relative",
              }}
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = flatRows[virtualRow.index]!
                return (
                  <div
                    key={row.type === "folder" ? `folder-${row.node.id}` : row.file.key}
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
                    {row.type === "folder" ? (
                      <DiffFolderRow
                        node={row.node}
                        isExpanded={row.isExpanded}
                        onToggle={() => toggleFolder(row.node.id)}
                      />
                    ) : (
                      <div className="pb-2">
                        <FileDiffCard
                          file={row.file}
                          data={diffViewDataByKey[row.file.key]!}
                          isLight={isLight}
                          isCollapsed={!!collapsedByFileKey[row.file.key]}
                          toggleCollapsed={toggleFileCollapsed}
                          isFullExpanded={!!fullExpandedByFileKey[row.file.key]}
                          toggleFullExpanded={toggleFileFullExpanded}
                          hasContent={!!fileContents[row.file.key]}
                          isLoadingContent={isLoadingFileContents}
                          diffMode={diffMode}
                          shikiHighlighter={shikiHighlighter}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center mb-3",
                  isLight ? "bg-emerald-100" : "bg-emerald-500/10",
                )}
              >
                <CheckCircle2
                  className={cn(
                    "w-5 h-5",
                    isLight ? "text-emerald-600" : "text-emerald-400",
                  )}
                />
              </div>
              <p className="text-sm font-medium mb-1">No changes detected</p>
              <p className="text-xs text-muted-foreground">
                Make some changes to see the diff
              </p>
            </div>
          )}
        </div>
      </div>
    )
  },
)
