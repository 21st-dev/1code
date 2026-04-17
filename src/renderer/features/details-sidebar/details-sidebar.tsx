"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ArrowUpRight, TerminalSquare, Box, ListTodo } from "lucide-react"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  IconDoubleChevronRight,
  PlanIcon,
  DiffIcon,
  OriginalMCPIcon,
  SearchIcon,
  ExpandIcon,
  CollapseIcon,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import {
  detailsSidebarOpenAtom,
  detailsSidebarWidthAtom,
  detailsSidebarTabAtom,
  widgetVisibilityAtomFamily,
  widgetOrderAtomFamily,
  WIDGET_REGISTRY,
  type WidgetId,
  type DetailsSidebarTab,
} from "./atoms"
import { WidgetSettingsPopup } from "./widget-settings-popup"
import { InfoSection } from "./sections/info-section"
import { TodoWidget } from "./sections/todo-widget"
import { PlanWidget } from "./sections/plan-widget"
import { TerminalWidget } from "./sections/terminal-widget"
import { ChangesWidget } from "./sections/changes-widget"
import { McpWidget } from "./sections/mcp-widget"
import { FilesTab, type FilesTabHandle } from "./sections/files-tab"
import type { ParsedDiffFile } from "./types"
import { fileViewerOpenAtomFamily, type AgentMode } from "../agents/atoms"
import {
  agentsSettingsDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
} from "@/lib/atoms"

// ============================================================================
// WidgetCard — extracted as a real component to avoid remounts
// ============================================================================

function getWidgetIcon(widgetId: WidgetId) {
  switch (widgetId) {
    case "info":
      return Box
    case "todo":
      return ListTodo
    case "plan":
      return PlanIcon
    case "terminal":
      return TerminalSquare
    case "diff":
      return DiffIcon
    case "mcp":
      return OriginalMCPIcon
    default:
      return Box
  }
}

function WidgetCard({
  widgetId,
  title,
  badge,
  children,
  customHeader,
  headerBg,
  hideExpand,
  onExpand,
}: {
  widgetId: WidgetId
  title: string
  badge?: React.ReactNode
  children: React.ReactNode
  customHeader?: React.ReactNode
  headerBg?: string
  hideExpand?: boolean
  onExpand?: () => void
}) {
  const Icon = getWidgetIcon(widgetId)
  const config = WIDGET_REGISTRY.find((w) => w.id === widgetId)
  const canExpand = (config?.canExpand ?? false) && !hideExpand && !!onExpand

  return (
    <div className="mx-2 mb-2">
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <div
          className={cn(
            "flex items-center gap-2 px-2 h-8 select-none group",
            !headerBg && "bg-muted/30",
          )}
          style={headerBg ? { backgroundColor: headerBg } : undefined}
        >
          {customHeader ? (
            <div className="flex-1 min-w-0 flex items-center gap-1">
              {customHeader}
            </div>
          ) : (
            <>
              <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-foreground flex-1">
                {title}
              </span>
              {badge}
            </>
          )}
          {canExpand && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onExpand}
                  className="h-5 w-5 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity,transform] duration-150 ease-out active:scale-[0.97] flex-shrink-0"
                  aria-label={`Expand ${widgetId}`}
                >
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Expand to sidebar</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}

// ============================================================================
// DetailsSidebar
// ============================================================================

interface DetailsSidebarProps {
  /** Workspace/chat ID */
  chatId: string
  /** Worktree path for terminal */
  worktreePath: string | null
  /** Plan path for plan section */
  planPath: string | null
  /** Current agent mode (plan or agent) */
  mode: AgentMode
  /** Callback when "Build plan" is clicked */
  onBuildPlan?: () => void
  /** Plan refetch trigger */
  planRefetchTrigger?: number
  /** Active sub-chat ID for plan */
  activeSubChatId?: string | null
  /** Sidebar open states - used to hide widgets when their sidebar is open */
  isPlanSidebarOpen?: boolean
  isTerminalSidebarOpen?: boolean
  isDiffSidebarOpen?: boolean
  /** Diff display mode - only hide widget when in side-peek mode */
  diffDisplayMode?: "side-peek" | "center-peek" | "full-page"
  /** Diff-related props */
  canOpenDiff: boolean
  setIsDiffSidebarOpen: (open: boolean) => void
  diffStats?: { additions: number; deletions: number; fileCount: number } | null
  /** Parsed diff files for file list */
  parsedFileDiffs?: ParsedDiffFile[] | null
  /** Callback to commit selected changes */
  onCommit?: (selectedPaths: string[]) => void
  /** Callback to commit and push selected changes */
  onCommitAndPush?: (selectedPaths: string[]) => void
  /** Whether commit is in progress */
  isCommitting?: boolean
  /** Git sync status for push/pull actions */
  gitStatus?: { pushCount?: number; pullCount?: number; hasUpstream?: boolean } | null
  /** Whether git sync status is loading */
  isGitStatusLoading?: boolean
  /** Current branch name for header */
  currentBranch?: string
  /** Callbacks to expand widgets to legacy sidebars */
  onExpandTerminal?: () => void
  onExpandPlan?: () => void
  onExpandDiff?: () => void
  /** Callback when a file is selected in Changes widget - opens diff with file selected */
  onFileSelect?: (filePath: string) => void
  /** Callback when a file is opened from Files tab - opens in file viewer */
  onOpenFile?: (absolutePath: string) => void
  /** Remote chat info for sandbox workspaces */
  remoteInfo?: {
    repository?: string
    branch?: string | null
    sandboxId?: string
  } | null
  /** Whether this is a remote sandbox chat (no local worktree) */
  isRemoteChat?: boolean
}

export function DetailsSidebar({
  chatId,
  worktreePath,
  planPath,
  mode,
  onBuildPlan,
  planRefetchTrigger,
  activeSubChatId,
  isPlanSidebarOpen,
  isTerminalSidebarOpen,
  isDiffSidebarOpen,
  diffDisplayMode,
  canOpenDiff,
  setIsDiffSidebarOpen,
  diffStats,
  parsedFileDiffs,
  onCommit,
  onCommitAndPush,
  isCommitting,
  gitStatus,
  isGitStatusLoading,
  currentBranch,
  onExpandTerminal,
  onExpandPlan,
  onExpandDiff,
  onFileSelect,
  onOpenFile,
  remoteInfo,
  isRemoteChat = false,
}: DetailsSidebarProps) {
  // Global sidebar open state
  const [isOpen, setIsOpen] = useAtom(detailsSidebarOpenAtom)

  // Active tab state (Details / Files)
  const [activeTab, setActiveTab] = useAtom(detailsSidebarTabAtom)

  // Files tab ref for header actions
  const filesTabRef = useRef<FilesTabHandle>(null)
  const [filesAllExpanded, setFilesAllExpanded] = useState(false)

  // Current file open in file viewer (for tree highlight sync)
  const fileViewerAtom = useMemo(() => fileViewerOpenAtomFamily(chatId), [chatId])
  const fileViewerPath = useAtomValue(fileViewerAtom)

  // Settings dialog atoms for MCP settings
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsTab = useSetAtom(agentsSettingsDialogActiveTabAtom)

  const handleOpenMcpSettings = useCallback(() => {
    setSettingsTab("mcp")
    setSettingsOpen(true)
  }, [setSettingsTab, setSettingsOpen])

  // Per-workspace widget visibility
  const widgetVisibilityAtom = useMemo(
    () => widgetVisibilityAtomFamily(chatId),
    [chatId],
  )
  const visibleWidgets = useAtomValue(widgetVisibilityAtom)

  // Per-workspace widget order
  const widgetOrderAtom = useMemo(
    () => widgetOrderAtomFamily(chatId),
    [chatId],
  )
  const widgetOrder = useAtomValue(widgetOrderAtom)

  // Close sidebar callback
  const closeSidebar = useCallback(() => {
    setIsOpen(false)
  }, [setIsOpen])

  // Resolved hotkeys for tooltips
  const toggleDetailsHotkey = useResolvedHotkeyDisplay("toggle-details")
  const fileSearchHotkey = useResolvedHotkeyDisplay("file-search")

  // Check if a widget should be shown
  const isWidgetVisible = useCallback(
    (widgetId: WidgetId) => visibleWidgets.includes(widgetId),
    [visibleWidgets],
  )

  // Keyboard shortcut: Cmd+Shift+\ to toggle details sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.metaKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.ctrlKey &&
        e.code === "Backslash"
      ) {
        e.preventDefault()
        e.stopPropagation()
        setIsOpen(!isOpen)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [setIsOpen, isOpen])

  // Stable noop callback for when onOpenFile is not provided
  const noopSelectFile = useCallback(() => {}, [])

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={detailsSidebarWidthAtom}
      side="right"
      minWidth={250}
      maxWidth={700}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-tl-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header with pill tabs */}
        <div className="flex items-center justify-between px-2 h-10 bg-tl-background flex-shrink-0 border-b border-border/50">
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeSidebar}
                  className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                  aria-label="Close details"
                >
                  <IconDoubleChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Close details
                {toggleDetailsHotkey && <Kbd>{toggleDetailsHotkey}</Kbd>}
              </TooltipContent>
            </Tooltip>

            {/* Pill tabs */}
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/50">
              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  activeTab === "details"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("files")}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                  activeTab === "files"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Files
              </button>
            </div>
          </div>

          {/* Right-side header actions */}
          {activeTab === "details" ? (
            <WidgetSettingsPopup workspaceId={chatId} isRemoteChat={isRemoteChat} />
          ) : (
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => filesTabRef.current?.openSearch()}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <SearchIcon className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Search files
                  {fileSearchHotkey && <Kbd>{fileSearchHotkey}</Kbd>}
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => filesTabRef.current?.toggleExpandCollapse()}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    {filesAllExpanded ? (
                      <CollapseIcon className="size-3.5" />
                    ) : (
                      <ExpandIcon className="size-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {filesAllExpanded ? "Collapse all" : "Expand all"}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Tab content — both tabs always mounted to preserve state */}
        <div className={cn("flex-1 overflow-y-auto py-2", activeTab !== "details" && "hidden")}>
          {widgetOrder.map((widgetId) => {
            // Skip if widget is not visible
            if (!isWidgetVisible(widgetId)) return null

            switch (widgetId) {
              case "info":
                return (
                  <WidgetCard key="info" widgetId="info" title="Workspace">
                    <InfoSection
                      chatId={chatId}
                      worktreePath={worktreePath}
                      remoteInfo={remoteInfo}
                    />
                  </WidgetCard>
                )

              case "todo":
                return (
                  <TodoWidget key="todo" subChatId={activeSubChatId || null} />
                )

              case "plan":
                // Hidden when Plan sidebar is open
                if (!planPath || isPlanSidebarOpen) return null
                return (
                  <PlanWidget
                    key="plan"
                    chatId={chatId}
                    activeSubChatId={activeSubChatId}
                    planPath={planPath}
                    refetchTrigger={planRefetchTrigger}
                    mode={mode}
                    onApprovePlan={onBuildPlan}
                    onExpandPlan={onExpandPlan}
                  />
                )

              case "terminal":
                // Hidden when Terminal sidebar is open
                if (!worktreePath || isTerminalSidebarOpen) return null
                return (
                  <TerminalWidget
                    key="terminal"
                    chatId={chatId}
                    cwd={worktreePath}
                    workspaceId={chatId}
                    onExpand={onExpandTerminal}
                  />
                )

              case "diff":
                // Show widget if we have diff stats (local or remote)
                // Hide only when Diff sidebar is open in side-peek mode
                const hasDiffStats = !!diffStats && (diffStats.fileCount > 0 || diffStats.additions > 0 || diffStats.deletions > 0)
                const canShowDiffWidget = canOpenDiff || (isRemoteChat && hasDiffStats)
                if (!canShowDiffWidget || (isDiffSidebarOpen && diffDisplayMode === "side-peek")) return null
                return (
                  <ChangesWidget
                    key="diff"
                    chatId={chatId}
                    worktreePath={worktreePath}
                    diffStats={diffStats}
                    parsedFileDiffs={parsedFileDiffs}
                    onCommit={onCommit}
                    onCommitAndPush={onCommitAndPush}
                    isCommitting={isCommitting}
                    pushCount={gitStatus?.pushCount ?? 0}
                    pullCount={gitStatus?.pullCount ?? 0}
                    hasUpstream={gitStatus?.hasUpstream ?? true}
                    isSyncStatusLoading={isGitStatusLoading}
                    currentBranch={currentBranch}
                    // For remote chats on desktop, don't provide expand/file actions
                    onExpand={canOpenDiff ? onExpandDiff : undefined}
                    onFileSelect={canOpenDiff ? onFileSelect : undefined}
                    diffDisplayMode={diffDisplayMode}
                  />
                )

              case "mcp":
                return (
                  <WidgetCard
                    key="mcp"
                    widgetId="mcp"
                    title="MCP"
                    badge={
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleOpenMcpSettings}
                            className="h-5 w-5 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity] duration-150 ease-out flex-shrink-0"
                            aria-label="MCP Settings"
                          >
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">Open settings</TooltipContent>
                      </Tooltip>
                    }
                    hideExpand
                  >
                    <McpWidget />
                  </WidgetCard>
                )

              default:
                return null
            }
          })}
        </div>
        <FilesTab
          ref={filesTabRef}
          worktreePath={worktreePath}
          onSelectFile={onOpenFile ?? noopSelectFile}
          onExpandedStateChange={setFilesAllExpanded}
          currentViewerFilePath={fileViewerPath}
          className={cn("flex-1", activeTab !== "files" && "hidden")}
        />
      </div>
    </ResizableSidebar>
  )
}
