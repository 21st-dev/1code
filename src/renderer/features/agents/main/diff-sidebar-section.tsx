/**
 * Diff sidebar section - extracted from active-chat.tsx
 *
 * Contains DiffStateContext, DiffStateProvider, DiffSidebarContent,
 * DiffSidebarRenderer, and CommitFileItem components that manage
 * the diff sidebar's state and rendering in isolation from ChatView
 * to prevent unnecessary re-renders.
 */

import { Button } from "../../../components/ui/button"
import {
  IconCloseSidebarRight,
} from "../../../components/ui/icons"
import { ResizableSidebar } from "../../../components/ui/resizable-sidebar"
import { useAtom, useAtomValue } from "jotai"
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { flushSync } from "react-dom"
import { toast } from "sonner"
import type { FileStatus } from "../../../../shared/changes-types"
import { trpc } from "../../../lib/trpc"
import { cn } from "../../../lib/utils"
import { ChangesPanel } from "../../changes"
import { DiffCenterPeekDialog } from "../../changes/components/diff-center-peek-dialog"
import { DiffFullPageView } from "../../changes/components/diff-full-page-view"
import { DiffSidebarHeader } from "../../changes/components/diff-sidebar-header"
import { getStatusIndicator } from "../../changes/utils/status"
import {
  agentsChangesPanelCollapsedAtom,
  agentsChangesPanelWidthAtom,
  agentsDiffSidebarWidthAtom,
  diffActiveTabAtom,
  filteredDiffFilesAtom,
  filteredSubChatIdAtom,
  selectedCommitAtom,
  selectedDiffFilePathAtom,
  type SelectedCommit,
} from "../atoms"
import type { DiffViewMode } from "../ui/agent-diff-view"
import {
  AgentDiffView,
  type AgentDiffViewRef,
  type ParsedDiffFile,
} from "../ui/agent-diff-view"

// ============================================================================
// DiffStateContext - isolates diff state management to prevent ChatView re-renders
// ============================================================================

interface DiffStateContextValue {
  selectedFilePath: string | null
  filteredSubChatId: string | null
  viewedCount: number
  handleDiffFileSelect: (file: { path: string }, category: string) => void
  handleSelectNextFile: (filePath: string) => void
  handleCommitSuccess: () => void
  handleCloseDiff: () => void
  handleViewedCountChange: (count: number) => void
  /** Ref to register a function that resets activeTab to "changes" before closing */
  resetActiveTabRef: React.MutableRefObject<(() => void) | null>
}

const DiffStateContext = createContext<DiffStateContextValue | null>(null)

function useDiffState() {
  const ctx = useContext(DiffStateContext)
  if (!ctx) throw new Error('useDiffState must be used within DiffStateProvider')
  return ctx
}

// Diff sidebar content component with responsive layout
interface DiffSidebarContentProps {
  worktreePath: string | null
  selectedFilePath: string | null
  onFileSelect: (file: { path: string }, category: string) => void
  chatId: string
  sandboxId: string | null
  repository?: string
  diffStats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string> | undefined
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  agentChat: { prUrl?: string | null; prNumber?: number | null } | null | undefined
  // Real-time sidebar width for responsive layout during resize
  sidebarWidth: number
  // Commit with AI
  onCommitWithAI?: () => void
  isCommittingWithAI?: boolean
  // Diff view mode
  diffMode: DiffViewMode
  setDiffMode: (mode: DiffViewMode) => void
  // Create PR callback
  onCreatePr?: () => void
  // Called after successful commit to reset diff view state
  onCommitSuccess?: () => void
  // Called after discarding/deleting changes to refresh diff
  onDiscardSuccess?: () => void
  // Subchats with changed files for filtering
  subChats?: Array<{ id: string; name: string; filePaths: string[]; fileCount: number }>
  // Initial subchat filter (e.g., from Review button)
  initialSubChatFilter?: string | null
  // Callback when marking file as viewed to select next file
  onSelectNextFile?: (filePath: string) => void
}

// Memoized commit file item for History tab
const CommitFileItem = memo(function CommitFileItem({
  file,
  onClick,
}: {
  file: { path: string; status: FileStatus }
  onClick: () => void
}) {
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors",
        "hover:bg-muted/80"
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0 flex items-center overflow-hidden">
        {dirPath && (
          <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
            {dirPath}/
          </span>
        )}
        <span className="text-xs font-medium flex-shrink-0 whitespace-nowrap">
          {fileName}
        </span>
      </div>
      <div className="shrink-0">
        {getStatusIndicator(file.status)}
      </div>
    </div>
  )
})

const DiffSidebarContent = memo(function DiffSidebarContent({
  worktreePath,
  chatId,
  sandboxId,
  repository,
  diffStats,
  setDiffStats,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  setDiffCollapseState,
  diffViewRef,
  agentChat,
  sidebarWidth,
  onCommitWithAI,
  isCommittingWithAI = false,
  diffMode,
  setDiffMode,
  onCreatePr,
  onDiscardSuccess,
  subChats = [],
}: Omit<DiffSidebarContentProps, 'selectedFilePath' | 'onFileSelect' | 'onCommitSuccess' | 'initialSubChatFilter' | 'onSelectNextFile'>) {
  // Get values from context instead of props
  const {
    selectedFilePath,
    filteredSubChatId,
    handleDiffFileSelect,
    handleSelectNextFile,
    handleCommitSuccess,
    handleViewedCountChange,
    resetActiveTabRef,
  } = useDiffState()

  // Compute initial selected file synchronously for first render
  // This prevents AgentDiffView from rendering all files before filter kicks in
  const initialSelectedFile = useMemo(() => {
    if (selectedFilePath) return selectedFilePath
    if (parsedFileDiffs && parsedFileDiffs.length > 0) {
      const firstFile = parsedFileDiffs[0]
      const filePath = firstFile.newPath !== '/dev/null' ? firstFile.newPath : firstFile.oldPath
      if (filePath && filePath !== '/dev/null') {
        return filePath
      }
    }
    return null
  }, [selectedFilePath, parsedFileDiffs])
  const [changesPanelWidth, setChangesPanelWidth] = useAtom(agentsChangesPanelWidthAtom)
  const [isChangesPanelCollapsed, setIsChangesPanelCollapsed] = useAtom(agentsChangesPanelCollapsedAtom)
  const [isResizing, setIsResizing] = useState(false)

  // Active tab state (Changes/History) - atom so external components can switch tabs
  const [activeTab, setActiveTab] = useAtom(diffActiveTabAtom)

  // Register the reset function so handleCloseDiff can reset to "changes" tab before closing
  // This prevents React 19 ref cleanup issues with HistoryView's ContextMenu components
  useEffect(() => {
    resetActiveTabRef.current = () => setActiveTab("changes")
    return () => {
      resetActiveTabRef.current = null
    }
  }, [resetActiveTabRef])

  // Selected commit for History tab
  const [selectedCommit, setSelectedCommit] = useAtom(selectedCommitAtom)

  // When sidebar is narrow (< 500px), use vertical layout
  const isNarrow = sidebarWidth < 500

  // Get diff stats for collapsed header display
  const { data: diffStatus } = trpc.changes.getStatus.useQuery(
    { worktreePath: worktreePath || "" },
    { enabled: !!worktreePath && isNarrow }
  )

  // Handle resize drag
  const handleResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = changesPanelWidth
      const pointerId = event.pointerId
      const handleElement = event.currentTarget as HTMLElement

      const minWidth = 200
      const maxWidth = 450

      const clampWidth = (width: number) =>
        Math.max(minWidth, Math.min(maxWidth, width))

      handleElement.setPointerCapture?.(pointerId)
      setIsResizing(true)

      const handlePointerMove = (e: PointerEvent) => {
        const delta = e.clientX - startX
        const newWidth = clampWidth(startWidth + delta)
        setChangesPanelWidth(newWidth)
      }

      const handlePointerUp = () => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }
        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", handlePointerUp)
        setIsResizing(false)
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", handlePointerUp, { once: true })
    },
    [changesPanelWidth, setChangesPanelWidth]
  )

  // Handle commit selection in History tab
  const handleCommitSelect = useCallback((commit: SelectedCommit) => {
    setSelectedCommit(commit)
    // Reset file selection when changing commits
    // The HistoryView will auto-select first file
  }, [setSelectedCommit])

  // Handle file selection in commit (History tab)
  const handleCommitFileSelect = useCallback((file: { path: string }, commitHash: string) => {
    // Set selected file path for highlighting
    handleDiffFileSelect(file, "")
  }, [handleDiffFileSelect])

  // Fetch commit files when a commit is selected
  const { data: commitFiles } = trpc.changes.getCommitFiles.useQuery(
    {
      worktreePath: worktreePath || "",
      commitHash: selectedCommit?.hash || "",
    },
    {
      enabled: !!worktreePath && !!selectedCommit,
      staleTime: 60000, // Cache for 1 minute
    }
  )

  // Fetch commit file diff when a commit is selected
  const { data: commitFileDiff } = trpc.changes.getCommitFileDiff.useQuery(
    {
      worktreePath: worktreePath || "",
      commitHash: selectedCommit?.hash || "",
      filePath: selectedFilePath || "",
    },
    {
      enabled: !!worktreePath && !!selectedCommit && !!selectedFilePath,
      staleTime: 60000, // Cache for 1 minute
    }
  )

  // Use commit diff or regular diff based on selection
  // Only use commit data when in History tab, otherwise always use regular diff
  const shouldUseCommitDiff = activeTab === "history" && selectedCommit
  const effectiveDiff = shouldUseCommitDiff && commitFileDiff ? commitFileDiff : diffContent
  const effectiveParsedFiles = shouldUseCommitDiff ? null : parsedFileDiffs
  const effectivePrefetchedContents = shouldUseCommitDiff ? {} : prefetchedFileContents

  if (isNarrow) {
    // Count changed files for collapsed header
    const changedFilesCount = diffStatus
      ? (diffStatus.staged?.length || 0) + (diffStatus.unstaged?.length || 0) + (diffStatus.untracked?.length || 0)
      : 0
    const stagedCount = diffStatus?.staged?.length || 0

    // Vertical layout: ChangesPanel on top, diff/file list below
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Top: ChangesPanel (file list + commit) */}
        {worktreePath && (
          <div className={cn(
            "flex-shrink-0 overflow-hidden flex flex-col",
            "h-[45%] min-h-[200px] border-b border-border/50"
          )}>
            <ChangesPanel
              worktreePath={worktreePath}
              activeTab={activeTab}
              selectedFilePath={selectedFilePath}
              onFileSelect={handleDiffFileSelect}
              onFileOpenPinned={() => {}}
              onCreatePr={onCreatePr}
              onCommitSuccess={handleCommitSuccess}
              onDiscardSuccess={onDiscardSuccess}
              subChats={subChats}
              initialSubChatFilter={filteredSubChatId}
              chatId={chatId}
              selectedCommitHash={selectedCommit?.hash}
              onCommitSelect={handleCommitSelect}
              onCommitFileSelect={handleCommitFileSelect}
              onActiveTabChange={setActiveTab}
              pushCount={diffStatus?.pushCount}
            />
          </div>
        )}
        {/* Bottom: File list (when History tab + commit selected) or AgentDiffView (diff) */}
        {/* Both views are always mounted but hidden via CSS to prevent expensive re-mounts */}
        <div className="flex-1 overflow-hidden flex flex-col relative">
          {/* History view - files in commit */}
          <div className={cn(
            "absolute inset-0 overflow-y-auto",
            activeTab === "history" && selectedCommit ? "z-10" : "z-0 invisible"
          )}>
            {selectedCommit && (
              !commitFiles ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  Loading files...
                </div>
              ) : commitFiles.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  No files changed in this commit
                </div>
              ) : (
                <>
                  {/* Commit message and description */}
                  <div className="px-3 py-2 border-b border-border/50">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="text-sm font-medium text-foreground flex-1">
                        {selectedCommit.message}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(selectedCommit.hash)
                          toast.success('Copied SHA to clipboard')
                        }}
                        className="text-xs font-mono text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
                      >
                        {selectedCommit.shortHash}
                      </button>
                    </div>
                    {selectedCommit.description && (
                      <div className="text-xs text-foreground/80 mb-2 whitespace-pre-wrap">
                        {selectedCommit.description}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : 'Unknown date'}
                    </div>
                  </div>

                  <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                    Files in commit ({commitFiles.length})
                  </div>
                  {commitFiles.map((file) => (
                    <CommitFileItem
                      key={file.path}
                      file={file}
                      onClick={() => {}}
                    />
                  ))}
                </>
              )
            )}
          </div>
          {/* Diff view - always mounted to prevent expensive re-initialization */}
          <div className={cn(
            "absolute inset-0 overflow-hidden",
            activeTab === "history" && selectedCommit ? "z-0 invisible" : "z-10"
          )}>
            <AgentDiffView
              ref={diffViewRef}
              chatId={chatId}
              sandboxId={sandboxId ?? ""}
              worktreePath={worktreePath || undefined}
              repository={repository}
              onStatsChange={setDiffStats}
              initialDiff={effectiveDiff}
              initialParsedFiles={effectiveParsedFiles as ParsedDiffFile[] | null | undefined}
              prefetchedFileContents={effectivePrefetchedContents}
              showFooter={false}
              onCollapsedStateChange={setDiffCollapseState}
              onSelectNextFile={handleSelectNextFile}
              onViewedCountChange={handleViewedCountChange}
              initialSelectedFile={initialSelectedFile}
            />
          </div>
        </div>
      </div>
    )
  }

  // Horizontal layout: files on left, diff on right
  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left: ChangesPanel (file list + commit) with resize handle */}
      {worktreePath && (
        <div
          className="h-full flex-shrink-0 relative"
          style={{ width: changesPanelWidth }}
        >
          <ChangesPanel
            worktreePath={worktreePath}
            activeTab={activeTab}
            selectedFilePath={selectedFilePath}
            onFileSelect={handleDiffFileSelect}
            onFileOpenPinned={() => {}}
            onCreatePr={onCreatePr}
            onCommitSuccess={handleCommitSuccess}
            onDiscardSuccess={onDiscardSuccess}
            subChats={subChats}
            initialSubChatFilter={filteredSubChatId}
            chatId={chatId}
            selectedCommitHash={selectedCommit?.hash}
            onCommitSelect={handleCommitSelect}
            onCommitFileSelect={handleCommitFileSelect}
            onActiveTabChange={setActiveTab}
            pushCount={diffStatus?.pushCount}
          />
          {/* Resize handle - styled like ResizableSidebar */}
          <div
            onPointerDown={handleResizePointerDown}
            className="absolute top-0 bottom-0 cursor-col-resize z-10"
            style={{
              right: 0,
              width: "4px",
              marginRight: "-2px",
            }}
          />
        </div>
      )}
      {/* Right: File list (when History tab) or AgentDiffView (when Changes tab) */}
      {/* Both views are always mounted but hidden via CSS to prevent expensive re-mounts */}
      <div className={cn(
        "flex-1 h-full min-w-0 overflow-hidden relative",
        "border-l border-border/50"
      )}>
        {/* History view - files in commit */}
        <div className={cn(
          "absolute inset-0 overflow-y-auto",
          activeTab === "history" && selectedCommit ? "z-10" : "z-0 invisible"
        )}>
          {selectedCommit && (
            !commitFiles ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                Loading files...
              </div>
            ) : commitFiles.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No files changed in this commit
              </div>
            ) : (
              <>
                {/* Commit message and description */}
                <div className="px-3 py-2 border-b border-border/50">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-sm font-medium text-foreground flex-1">
                      {selectedCommit.message}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(selectedCommit.hash)
                        toast.success('Copied SHA to clipboard')
                      }}
                      className="text-xs font-mono text-muted-foreground hover:text-foreground underline cursor-pointer shrink-0"
                    >
                      {selectedCommit.shortHash}
                    </button>
                  </div>
                  {selectedCommit.description && (
                    <div className="text-xs text-foreground/80 mb-2 whitespace-pre-wrap">
                      {selectedCommit.description}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {selectedCommit.author} • {selectedCommit.date ? new Date(selectedCommit.date).toLocaleString() : 'Unknown date'}
                  </div>
                </div>

                <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium bg-muted/30 border-b border-border/50">
                  Files in commit ({commitFiles.length})
                </div>
                {commitFiles.map((file) => (
                  <CommitFileItem
                    key={file.path}
                    file={file}
                    onClick={() => {}}
                  />
                ))}
              </>
            )
          )}
        </div>
        {/* Diff view - always mounted to prevent expensive re-initialization */}
        <div className={cn(
          "absolute inset-0 overflow-hidden",
          activeTab === "history" && selectedCommit ? "z-0 invisible" : "z-10"
        )}>
          <AgentDiffView
            ref={diffViewRef}
            chatId={chatId}
            sandboxId={sandboxId ?? ""}
            worktreePath={worktreePath || undefined}
            repository={repository}
            onStatsChange={setDiffStats}
            initialDiff={effectiveDiff}
            initialParsedFiles={effectiveParsedFiles as ParsedDiffFile[] | null | undefined}
            prefetchedFileContents={effectivePrefetchedContents}
            showFooter={true}
            onCollapsedStateChange={setDiffCollapseState}
            onSelectNextFile={handleSelectNextFile}
            onViewedCountChange={handleViewedCountChange}
            initialSelectedFile={initialSelectedFile}
          />
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// DiffStateProvider - manages diff state in isolation from ChatView
// This prevents ChatView from re-rendering when selected file changes
// ============================================================================

interface DiffStateProviderProps {
  isDiffSidebarOpen: boolean
  parsedFileDiffs: ParsedDiffFile[] | null
  isDiffSidebarNarrow: boolean
  setIsDiffSidebarOpen: (open: boolean) => void
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  setDiffContent: (content: string | null) => void
  setParsedFileDiffs: (files: ParsedDiffFile[] | null) => void
  setPrefetchedFileContents: (contents: Record<string, string>) => void
  fetchDiffStats: () => void
  children: React.ReactNode
}

const DiffStateProvider = memo(function DiffStateProvider({
  isDiffSidebarOpen,
  parsedFileDiffs,
  isDiffSidebarNarrow,
  setIsDiffSidebarOpen,
  setDiffStats,
  setDiffContent,
  setParsedFileDiffs,
  setPrefetchedFileContents,
  fetchDiffStats,
  children,
}: DiffStateProviderProps) {
  // Viewed count state - kept here to avoid re-rendering ChatView
  const [viewedCount, setViewedCount] = useState(0)

  // Ref for resetting activeTab to "changes" before closing
  // This prevents React 19 ref cleanup issues with HistoryView's ContextMenu components
  const resetActiveTabRef = useRef<(() => void) | null>(null)

  // All diff-related atoms are read HERE, not in ChatView
  const [selectedFilePath, setSelectedFilePath] = useAtom(selectedDiffFilePathAtom)
  const [, setFilteredDiffFiles] = useAtom(filteredDiffFilesAtom)
  const [filteredSubChatId, setFilteredSubChatId] = useAtom(filteredSubChatIdAtom)
  const isChangesPanelCollapsed = useAtomValue(agentsChangesPanelCollapsedAtom)

  // Auto-select first file when diff sidebar opens - use useLayoutEffect for synchronous update
  // This prevents the initial render from showing all 11 files before filter kicks in
  useLayoutEffect(() => {
    if (!isDiffSidebarOpen) {
      setSelectedFilePath(null)
      setFilteredDiffFiles(null)
      return
    }

    // Determine which file to select
    let fileToSelect = selectedFilePath
    if (!fileToSelect && parsedFileDiffs && parsedFileDiffs.length > 0) {
      const firstFile = parsedFileDiffs[0]
      fileToSelect = firstFile.newPath !== '/dev/null' ? firstFile.newPath : firstFile.oldPath
      if (fileToSelect && fileToSelect !== '/dev/null') {
        setSelectedFilePath(fileToSelect)
      }
    }

    // Filter logic based on layout mode
    const shouldShowAllFiles = isDiffSidebarNarrow && isChangesPanelCollapsed

    if (shouldShowAllFiles) {
      setFilteredDiffFiles(null)
    } else if (fileToSelect) {
      setFilteredDiffFiles([fileToSelect])
    } else {
      setFilteredDiffFiles(null)
    }
  }, [isDiffSidebarOpen, selectedFilePath, parsedFileDiffs, isDiffSidebarNarrow, isChangesPanelCollapsed, setFilteredDiffFiles, setSelectedFilePath])

  // Stable callbacks
  const handleDiffFileSelect = useCallback((file: { path: string }, _category: string) => {
    setSelectedFilePath(file.path)
    setFilteredDiffFiles([file.path])
  }, [setSelectedFilePath, setFilteredDiffFiles])

  const handleSelectNextFile = useCallback((filePath: string) => {
    setSelectedFilePath(filePath)
    setFilteredDiffFiles([filePath])
  }, [setSelectedFilePath, setFilteredDiffFiles])

  const handleCommitSuccess = useCallback(() => {
    setSelectedFilePath(null)
    setFilteredDiffFiles(null)
    setParsedFileDiffs(null)
    setDiffContent(null)
    setPrefetchedFileContents({})
    setDiffStats({
      fileCount: 0,
      additions: 0,
      deletions: 0,
      isLoading: true,
      hasChanges: false,
    })
    setTimeout(() => {
      fetchDiffStats()
    }, 2000)
  }, [setSelectedFilePath, setFilteredDiffFiles, setParsedFileDiffs, setDiffContent, setPrefetchedFileContents, setDiffStats, fetchDiffStats])

  const handleCloseDiff = useCallback(() => {
    // Use flushSync to reset activeTab synchronously before closing.
    // This unmounts HistoryView's ContextMenu components in a single commit,
    // preventing React 19 ref cleanup "Maximum update depth exceeded" error.
    flushSync(() => {
      resetActiveTabRef.current?.()
    })
    setIsDiffSidebarOpen(false)
    setFilteredSubChatId(null)
  }, [setIsDiffSidebarOpen, setFilteredSubChatId])

  const handleViewedCountChange = useCallback((count: number) => {
    setViewedCount(count)
  }, [])

  const contextValue = useMemo(() => ({
    selectedFilePath,
    filteredSubChatId,
    viewedCount,
    handleDiffFileSelect,
    handleSelectNextFile,
    handleCommitSuccess,
    handleCloseDiff,
    handleViewedCountChange,
    resetActiveTabRef,
  }), [selectedFilePath, filteredSubChatId, viewedCount, handleDiffFileSelect, handleSelectNextFile, handleCommitSuccess, handleCloseDiff, handleViewedCountChange])

  return (
    <DiffStateContext.Provider value={contextValue}>
      {children}
    </DiffStateContext.Provider>
  )
})

// ============================================================================
// DiffSidebarRenderer - renders the diff sidebar using context for state
// This component is inside DiffStateProvider and uses useDiffState()
// ============================================================================

interface DiffSidebarRendererProps {
  worktreePath: string | null
  chatId: string
  sandboxId?: string | null
  repository?: string | null
  diffStats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }
  diffContent: string | null
  parsedFileDiffs: ParsedDiffFile[] | null
  prefetchedFileContents: Record<string, string>
  setDiffCollapseState: (state: { allCollapsed: boolean; allExpanded: boolean }) => void
  diffViewRef: React.RefObject<AgentDiffViewRef | null>
  diffSidebarRef: React.RefObject<HTMLDivElement | null>
  agentChat: { prUrl?: string | null; prNumber?: number | null } | null | undefined
  branchData: { current: string } | undefined
  gitStatus: { pushCount?: number; pullCount?: number; hasUpstream?: boolean; ahead?: number; behind?: number; staged?: any[]; unstaged?: any[]; untracked?: any[] } | undefined
  isGitStatusLoading: boolean
  isDiffSidebarOpen: boolean
  diffDisplayMode: "side-peek" | "center-peek" | "full-page"
  diffSidebarWidth: number
  handleReview: () => void
  isReviewing: boolean
  handleCreatePrDirect: () => void
  handleCreatePr: () => void
  isCreatingPr: boolean
  handleMergePr: () => void
  mergePrMutation: { isPending: boolean }
  handleRefreshGitStatus: () => void
  hasPrNumber: boolean
  isPrOpen: boolean
  hasMergeConflicts: boolean
  handleFixConflicts: () => void
  handleExpandAll: () => void
  handleCollapseAll: () => void
  diffMode: DiffViewMode
  setDiffMode: (mode: DiffViewMode) => void
  handleMarkAllViewed: () => void
  handleMarkAllUnviewed: () => void
  isDesktop: boolean
  isFullscreen: boolean | null
  setDiffDisplayMode: (mode: "side-peek" | "center-peek" | "full-page") => void
  handleCommitToPr: (selectedPaths?: string[]) => void
  isCommittingToPr: boolean
  subChatsWithFiles: Array<{ id: string; name: string; filePaths: string[]; fileCount: number }>
  setDiffStats: (stats: { isLoading: boolean; hasChanges: boolean; fileCount: number; additions: number; deletions: number }) => void
  onDiscardSuccess?: () => void
}

const DiffSidebarRenderer = memo(function DiffSidebarRenderer({
  worktreePath,
  chatId,
  sandboxId,
  repository,
  diffStats,
  diffContent,
  parsedFileDiffs,
  prefetchedFileContents,
  setDiffCollapseState,
  diffViewRef,
  diffSidebarRef,
  agentChat,
  branchData,
  gitStatus,
  isGitStatusLoading,
  isDiffSidebarOpen,
  diffDisplayMode,
  diffSidebarWidth,
  handleReview,
  isReviewing,
  handleCreatePrDirect,
  handleCreatePr,
  isCreatingPr,
  handleMergePr,
  mergePrMutation,
  handleRefreshGitStatus,
  hasPrNumber,
  isPrOpen,
  hasMergeConflicts,
  handleFixConflicts,
  handleExpandAll,
  handleCollapseAll,
  diffMode,
  setDiffMode,
  handleMarkAllViewed,
  handleMarkAllUnviewed,
  isDesktop,
  isFullscreen,
  setDiffDisplayMode,
  handleCommitToPr,
  isCommittingToPr,
  subChatsWithFiles,
  setDiffStats,
  onDiscardSuccess,
}: DiffSidebarRendererProps) {
  // Get callbacks and state from context
  const { handleCloseDiff, viewedCount, handleViewedCountChange } = useDiffState()

  const handleReviewWithAI = useCallback(() => {
    if (diffDisplayMode !== "side-peek") {
      handleCloseDiff()
    }
    handleReview()
  }, [diffDisplayMode, handleCloseDiff, handleReview])

  const handleCreatePrWithAI = useCallback(() => {
    if (diffDisplayMode !== "side-peek") {
      handleCloseDiff()
    }
    handleCreatePr()
  }, [diffDisplayMode, handleCloseDiff, handleCreatePr])

  // Width for responsive layouts - use stored width for sidebar, fixed for dialog/fullpage
  const effectiveWidth = diffDisplayMode === "side-peek"
    ? diffSidebarWidth
    : diffDisplayMode === "center-peek"
      ? 1200
      : typeof window !== 'undefined' ? window.innerWidth : 1200

  const diffViewContent = (
    <div
      ref={diffSidebarRef}
      className="flex flex-col h-full min-w-0 overflow-hidden"
    >
      {/* Unified Header - branch selector, fetch, review, PR actions, close */}
      {worktreePath ? (
        <DiffSidebarHeader
          worktreePath={worktreePath}
          currentBranch={branchData?.current ?? ""}
          diffStats={diffStats}
          sidebarWidth={effectiveWidth}
          pushCount={gitStatus?.pushCount ?? 0}
          pullCount={gitStatus?.pullCount ?? 0}
          hasUpstream={gitStatus?.hasUpstream ?? true}
          isSyncStatusLoading={isGitStatusLoading}
          aheadOfDefault={gitStatus?.ahead ?? 0}
          behindDefault={gitStatus?.behind ?? 0}
          onReview={handleReviewWithAI}
          isReviewing={isReviewing}
          onCreatePr={handleCreatePrDirect}
          isCreatingPr={isCreatingPr}
          onCreatePrWithAI={handleCreatePrWithAI}
          isCreatingPrWithAI={isCreatingPr}
          onMergePr={handleMergePr}
          isMergingPr={mergePrMutation.isPending}
          onClose={handleCloseDiff}
          onRefresh={handleRefreshGitStatus}
          hasPrNumber={hasPrNumber}
          isPrOpen={isPrOpen}
          hasMergeConflicts={hasMergeConflicts}
          onFixConflicts={handleFixConflicts}
          onExpandAll={handleExpandAll}
          onCollapseAll={handleCollapseAll}
          viewMode={diffMode}
          onViewModeChange={setDiffMode}
          viewedCount={viewedCount}
          onMarkAllViewed={handleMarkAllViewed}
          onMarkAllUnviewed={handleMarkAllUnviewed}
          isDesktop={isDesktop}
          isFullscreen={isFullscreen ?? undefined}
          displayMode={diffDisplayMode}
          onDisplayModeChange={setDiffDisplayMode}
        />
      ) : sandboxId ? (
        <div className="flex items-center h-10 px-2 border-b border-border/50 bg-background flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0 hover:bg-foreground/10"
            onClick={handleCloseDiff}
          >
            <IconCloseSidebarRight className="size-4 text-muted-foreground" />
          </Button>
          <span className="text-sm text-muted-foreground ml-2">Changes</span>
        </div>
      ) : null}

      {/* Content: file list + diff view - vertical when narrow */}
      <DiffSidebarContent
        worktreePath={worktreePath}
        chatId={chatId}
        sandboxId={sandboxId ?? null}
        repository={repository ?? undefined}
        diffStats={diffStats}
        setDiffStats={setDiffStats}
        diffContent={diffContent}
        parsedFileDiffs={parsedFileDiffs}
        prefetchedFileContents={prefetchedFileContents}
        setDiffCollapseState={setDiffCollapseState}
        diffViewRef={diffViewRef}
        agentChat={agentChat}
        sidebarWidth={effectiveWidth}
        onCommitWithAI={handleCommitToPr}
        isCommittingWithAI={isCommittingToPr}
        diffMode={diffMode}
        setDiffMode={setDiffMode}
        onCreatePr={handleCreatePrDirect}
        onDiscardSuccess={onDiscardSuccess}
        subChats={subChatsWithFiles}
      />
    </div>
  )

  // Render based on display mode
  if (diffDisplayMode === "side-peek") {
    return (
      <ResizableSidebar
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
        widthAtom={agentsDiffSidebarWidthAtom}
        minWidth={320}
        side="right"
        animationDuration={0}
        initialWidth={0}
        exitWidth={0}
        showResizeTooltip={true}
        className="bg-background border-l"
        style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
      >
        {diffViewContent}
      </ResizableSidebar>
    )
  }

  if (diffDisplayMode === "center-peek") {
    return (
      <DiffCenterPeekDialog
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
      >
        {diffViewContent}
      </DiffCenterPeekDialog>
    )
  }

  if (diffDisplayMode === "full-page") {
    return (
      <DiffFullPageView
        isOpen={isDiffSidebarOpen}
        onClose={handleCloseDiff}
      >
        {diffViewContent}
      </DiffFullPageView>
    )
  }

  return null
})

// Export all components and types for use by active-chat.tsx
export {
  DiffStateContext,
  useDiffState,
  DiffSidebarContent,
  CommitFileItem,
  DiffStateProvider,
  DiffSidebarRenderer,
}

export type {
  DiffStateContextValue,
  DiffSidebarContentProps,
  DiffStateProviderProps,
  DiffSidebarRendererProps,
}
