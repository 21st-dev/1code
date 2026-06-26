"use client"

import { useAtom, useAtomValue, useSetAtom } from "jotai"
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Box,
  FileSearch,
  Globe2,
  ListTodo,
  TerminalSquare,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  CollapseIcon,
  DiffIcon,
  ExpandIcon,
  IconDoubleChevronRight,
  OriginalMCPIcon,
  PlanIcon,
  SearchIcon,
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import { ResizableSidebar } from "@/components/ui/resizable-sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
} from "@/lib/atoms"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { ChangedFile } from "../../../shared/changes-types"
import type { TerminalInitialCommandIntent } from "../../../shared/terminal-initial-command-intents"
import type { AgentMode } from "../agents/atoms"
import {
  detailsSidebarAutoOpenSuppressedAtom,
  detailsSidebarOpenAtom,
  detailsSidebarTabAtom,
  detailsSidebarWidthAtom,
  selectedFileAtomFamily,
  WIDGET_REGISTRY,
  type WidgetId,
  widgetOrderAtomFamily,
  widgetVisibilityAtomFamily,
} from "./atoms"
import { BrowserWidget } from "./sections/browser-widget"
import { ChangesWidget } from "./sections/changes-widget"
import { FilesTab, type FilesTabHandle } from "./sections/files-tab"
import { InfoSection } from "./sections/info-section"
import { McpWidget } from "./sections/mcp-widget"
import { PlanWidget } from "./sections/plan-widget"
import { RunErrorWidget } from "./sections/run-error-widget"
import { RunTraceWidget } from "./sections/run-trace-widget"
import { RunUsageWidget } from "./sections/run-usage-widget"
import { TerminalWidget } from "./sections/terminal-widget"
import { TodoWidget } from "./sections/todo-widget"
import type { ParsedDiffFile } from "./types"
import { WidgetSettingsPopup } from "./widget-settings-popup"

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
    case "file":
      return FileSearch
    case "browser":
      return Globe2
    case "mcp":
      return OriginalMCPIcon
    case "trace":
      return Activity
    case "usage":
      return BarChart3
    case "error":
      return AlertCircle
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
  const { t } = useI18n()
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
                  aria-label={t("details.expandToSidebar")}
                >
                  <ArrowUpRight className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t("details.expandToSidebar")}
              </TooltipContent>
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
  /** Terminal scope key shared with the full terminal renderer */
  terminalScopeKey?: string
  terminalTabId?: string
  terminalInitialCommandIntents?: TerminalInitialCommandIntent[]
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
  /** Diff display mode used for widget copy while full-page review is open */
  diffDisplayMode?: "details-expanded" | "full-page"
  /** Diff-related props */
  canOpenDiff: boolean
  setIsDiffSidebarOpen: (open: boolean) => void
  diffStats?: { additions: number; deletions: number; fileCount: number } | null
  /** Parsed diff files for file list */
  parsedFileDiffs?: ParsedDiffFile[] | null
  /** Callback to refresh diff and git status after local git actions */
  onChangesRefresh?: () => void
  /** Git sync status for push/pull actions */
  gitStatus?: {
    pushCount?: number
    pullCount?: number
    hasUpstream?: boolean
    staged?: ChangedFile[]
    unstaged?: ChangedFile[]
    untracked?: ChangedFile[]
  } | null
  /** Whether git sync status is loading */
  isGitStatusLoading?: boolean
  /** Current branch name for header */
  currentBranch?: string
  /** Callbacks to expand widgets to legacy sidebars */
  onExpandTerminal?: () => void
  onExpandPlan?: () => void
  onExpandDiff?: () => void
  onExpandBrowser?: () => void
  /** Callback when a file is selected in Changes widget - opens diff with file selected */
  onFileSelect?: (filePath: string) => void
  /** Callback when a file is opened from Files tab - opens in file viewer */
  onOpenFile?: (absolutePath: string) => void
}

export function DetailsSidebar({
  chatId,
  worktreePath,
  terminalScopeKey,
  terminalTabId,
  terminalInitialCommandIntents,
  planPath,
  mode,
  onBuildPlan,
  planRefetchTrigger,
  activeSubChatId,
  diffDisplayMode,
  canOpenDiff,
  diffStats,
  parsedFileDiffs,
  onChangesRefresh,
  gitStatus,
  isGitStatusLoading,
  currentBranch,
  onExpandTerminal,
  onExpandPlan,
  onExpandDiff,
  onExpandBrowser,
  onFileSelect,
  onOpenFile,
}: DetailsSidebarProps) {
  const { t } = useI18n()
  // Global sidebar open state
  const [isOpen, setIsOpen] = useAtom(detailsSidebarOpenAtom)
  const setDetailsSidebarAutoOpenSuppressed = useSetAtom(
    detailsSidebarAutoOpenSuppressedAtom,
  )

  // Active tab state (Details / Files)
  const [activeTab, setActiveTab] = useAtom(detailsSidebarTabAtom)

  // Files tab ref for header actions
  const filesTabRef = useRef<FilesTabHandle>(null)
  const [filesAllExpanded, setFilesAllExpanded] = useState(false)

  // Current Details-owned file preview selection (for tree highlight sync)
  const selectedFileAtom = useMemo(
    () => selectedFileAtomFamily(chatId),
    [chatId],
  )
  const selectedFilePath = useAtomValue(selectedFileAtom)

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
  const widgetOrderAtom = useMemo(() => widgetOrderAtomFamily(chatId), [chatId])
  const widgetOrder = useAtomValue(widgetOrderAtom)

  // Close sidebar callback
  const closeSidebar = useCallback(() => {
    setDetailsSidebarAutoOpenSuppressed(true)
    setIsOpen(false)
  }, [setDetailsSidebarAutoOpenSuppressed, setIsOpen])

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
        const nextIsOpen = !isOpen
        setDetailsSidebarAutoOpenSuppressed(!nextIsOpen)
        setIsOpen(nextIsOpen)
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [setDetailsSidebarAutoOpenSuppressed, setIsOpen, isOpen])

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
                  aria-label={t("details.close")}
                >
                  <IconDoubleChevronRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t("details.close")}
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
                {t("details.details")}
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
                {t("details.files")}
              </button>
            </div>
          </div>

          {/* Right-side header actions */}
          {activeTab === "details" ? (
            <WidgetSettingsPopup workspaceId={chatId} />
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
                  {t("details.searchFiles")}
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
                  {filesAllExpanded
                    ? t("details.collapseAll")
                    : t("details.expandAll")}
                </TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>

        {/* Tab content — both tabs always mounted to preserve state */}
        <div
          className={cn(
            "flex-1 overflow-y-auto py-2",
            activeTab !== "details" && "hidden",
          )}
        >
          {widgetOrder.map((widgetId) => {
            // Skip if widget is not visible
            if (!isWidgetVisible(widgetId)) return null

            switch (widgetId) {
              case "info":
                return (
                  <WidgetCard
                    key="info"
                    widgetId="info"
                    title={t("details.workspace")}
                  >
                    <InfoSection chatId={chatId} worktreePath={worktreePath} />
                  </WidgetCard>
                )

              case "todo":
                return (
                  <TodoWidget key="todo" subChatId={activeSubChatId || null} />
                )

              case "trace":
                return (
                  <WidgetCard
                    key="trace"
                    widgetId="trace"
                    title={t("details.trace")}
                  >
                    <RunTraceWidget
                      chatId={chatId}
                      activeSubChatId={activeSubChatId}
                    />
                  </WidgetCard>
                )

              case "usage":
                return (
                  <WidgetCard
                    key="usage"
                    widgetId="usage"
                    title={t("details.usage")}
                  >
                    <RunUsageWidget
                      chatId={chatId}
                      activeSubChatId={activeSubChatId}
                    />
                  </WidgetCard>
                )

              case "error":
                return (
                  <WidgetCard
                    key="error"
                    widgetId="error"
                    title={t("details.error")}
                  >
                    <RunErrorWidget
                      chatId={chatId}
                      activeSubChatId={activeSubChatId}
                    />
                  </WidgetCard>
                )

              case "plan":
                if (!planPath) return null
                return (
                  <PlanWidget
                    key="plan"
                    chatId={chatId}
                    activeSubChatId={activeSubChatId}
                    projectPath={worktreePath}
                    planPath={planPath}
                    refetchTrigger={planRefetchTrigger}
                    mode={mode}
                    onApprovePlan={onBuildPlan}
                    onExpandPlan={onExpandPlan}
                  />
                )

              case "terminal":
                if (!worktreePath) return null
                return (
                  <TerminalWidget
                    key="terminal"
                    chatId={chatId}
                    scopeKey={terminalScopeKey}
                    cwd={worktreePath}
                    workspaceId={chatId}
                    tabId={terminalTabId}
                    initialCommandIntents={terminalInitialCommandIntents}
                    onExpand={onExpandTerminal}
                  />
                )

              case "diff":
                // Show widget if we have local diff stats
                if (!canOpenDiff) return null
                return (
                  <ChangesWidget
                    key="diff"
                    chatId={chatId}
                    worktreePath={worktreePath}
                    diffStats={diffStats}
                    parsedFileDiffs={parsedFileDiffs}
                    onRefresh={onChangesRefresh}
                    pushCount={gitStatus?.pushCount ?? 0}
                    pullCount={gitStatus?.pullCount ?? 0}
                    hasUpstream={gitStatus?.hasUpstream ?? true}
                    staged={gitStatus?.staged ?? []}
                    unstaged={gitStatus?.unstaged ?? []}
                    untracked={gitStatus?.untracked ?? []}
                    isSyncStatusLoading={isGitStatusLoading}
                    currentBranch={currentBranch}
                    onExpand={onExpandDiff}
                    onFileSelect={onFileSelect}
                    diffDisplayMode={diffDisplayMode}
                  />
                )

              case "browser":
                if (!worktreePath) return null
                return (
                  <WidgetCard
                    key="browser"
                    widgetId="browser"
                    title={t("localBrowser.title")}
                    onExpand={onExpandBrowser}
                  >
                    <BrowserWidget onExpand={onExpandBrowser} />
                  </WidgetCard>
                )

              case "mcp":
                return (
                  <WidgetCard
                    key="mcp"
                    widgetId="mcp"
                    title={t("details.mcpServers")}
                    badge={
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleOpenMcpSettings}
                            className="h-5 w-5 p-0 hover:bg-foreground/10 text-muted-foreground hover:text-foreground rounded-md opacity-0 group-hover:opacity-100 transition-[background-color,opacity] duration-150 ease-out flex-shrink-0"
                            aria-label={t("details.mcpSettings")}
                          >
                            <ArrowUpRight className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                          {t("details.openSettings")}
                        </TooltipContent>
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
          currentViewerFilePath={selectedFilePath}
          className={cn("flex-1", activeTab !== "files" && "hidden")}
        />
      </div>
    </ResizableSidebar>
  )
}
