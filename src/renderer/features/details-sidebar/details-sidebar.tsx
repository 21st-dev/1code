"use client"

import { useCallback, useEffect, useMemo } from "react"
import { useAtom, useAtomValue } from "jotai"
import { ArrowUpRight, TerminalSquare, Box, ListTodo, Gauge } from "lucide-react"
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
} from "@/components/ui/icons"
import { Kbd } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { useResolvedHotkeyDisplay } from "@/lib/hotkeys"
import {
  detailsSidebarOpenAtom,
  detailsSidebarWidthAtom,
  widgetVisibilityAtomFamily,
  widgetOrderAtomFamily,
  WIDGET_REGISTRY,
  type WidgetId,
} from "./atoms"
import { WidgetSettingsPopup } from "./widget-settings-popup"
import { InfoSection } from "./sections/info-section"
import { TodoWidget } from "./sections/todo-widget"
import { PlanWidget } from "./sections/plan-widget"
import { TerminalWidget } from "./sections/terminal-widget"
import { ChangesWidget } from "./sections/changes-widget"
import { UsageWidget } from "./sections/usage-widget"
import type { ParsedDiffFile } from "./types"
import type { AgentMode } from "../agents/atoms"

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
  /** Whether commit is in progress */
  isCommitting?: boolean
  /** Callbacks to expand widgets to legacy sidebars */
  onExpandTerminal?: () => void
  onExpandPlan?: () => void
  onExpandDiff?: () => void
  /** Callback when a file is selected in Changes widget - opens diff with file selected */
  onFileSelect?: (filePath: string) => void
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
  isCommitting,
  onExpandTerminal,
  onExpandPlan,
  onExpandDiff,
  onFileSelect,
  remoteInfo,
  isRemoteChat = false,
}: DetailsSidebarProps) {
  // Global sidebar open state
  const [isOpen, setIsOpen] = useAtom(detailsSidebarOpenAtom)

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

  // Resolved hotkey for tooltip
  const toggleDetailsHotkey = useResolvedHotkeyDisplay("toggle-details")

  // Expand widget to legacy sidebar
  const handleExpandWidget = useCallback(
    (widgetId: WidgetId) => {
      switch (widgetId) {
        case "terminal":
          onExpandTerminal?.()
          break
        case "plan":
          onExpandPlan?.()
          break
        case "diff":
          onExpandDiff?.()
          break
      }
    },
    [onExpandTerminal, onExpandPlan, onExpandDiff],
  )

  // Check if a widget should be shown
  const isWidgetVisible = useCallback(
    (widgetId: WidgetId) => visibleWidgets.includes(widgetId),
    [visibleWidgets],
  )

  // Check if a widget can be expanded
  const canWidgetExpand = useCallback((widgetId: WidgetId) => {
    const config = WIDGET_REGISTRY.find((w) => w.id === widgetId)
    return config?.canExpand ?? false
  }, [])

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

  // Get icon for widget
  const getWidgetIcon = useCallback((widgetId: WidgetId) => {
    switch (widgetId) {
      case "info":
        return Box
      case "usage":
        return Gauge
      case "todo":
        return ListTodo
      case "plan":
        return PlanIcon
      case "terminal":
        return TerminalSquare
      case "diff":
        return DiffIcon
      default:
        return Box
    }
  }, [])

  // Widget Card Component - always expanded, no collapse functionality
  const WidgetCard = useCallback(
    ({
      widgetId,
      title,
      badge,
      children,
      customHeader,
      headerBg,
      hideExpand,
    }: {
      widgetId: WidgetId
      title: string
      badge?: React.ReactNode
      children: React.ReactNode
      /** Custom header content (replaces default icon + title) */
      customHeader?: React.ReactNode
      /** Custom background color for header */
      headerBg?: string
      /** Hide the expand button (when custom actions are in badge) */
      hideExpand?: boolean
    }) => {
      const Icon = getWidgetIcon(widgetId)
      const canExpand = canWidgetExpand(widgetId) && !hideExpand

      return (
        <div className="mx-2 mb-2">
          <div
            className={cn(
              "rounded-lg border border-border/50 overflow-hidden",
            )}
          >
            {/* Widget Header - fixed height h-8 for consistency */}
            <div
              className={cn(
                "flex items-center gap-2 px-2 h-8 select-none group",
                !headerBg && "bg-muted/30",
              )}
              style={headerBg ? { backgroundColor: headerBg } : undefined}
            >
              {customHeader ? (
                // Custom header content (e.g., terminal tabs)
                <div className="flex-1 min-w-0 flex items-center gap-1">
                  {customHeader}
                </div>
              ) : (
                // Default header with icon and title
                <>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs font-medium text-foreground flex-1">
                    {title}
                  </span>
                  {badge}
                </>
              )}

              {/* Expand to sidebar button */}
              {canExpand && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleExpandWidget(widgetId)}
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

            {/* Widget Content - always visible */}
            <div>{children}</div>
          </div>
        </div>
      )
    },
    [getWidgetIcon, canWidgetExpand, handleExpandWidget],
  )

  return (
    <ResizableSidebar
      isOpen={isOpen}
      onClose={closeSidebar}
      widthAtom={detailsSidebarWidthAtom}
      side="right"
      minWidth={350}
      maxWidth={700}
      animationDuration={0}
      initialWidth={0}
      exitWidth={0}
      showResizeTooltip={true}
      className="bg-tl-background border-l"
      style={{ borderLeftWidth: "0.5px", overflow: "hidden" }}
    >
      <div className="flex flex-col h-full min-w-0 overflow-hidden">
        {/* Header */}
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
            <span className="text-sm font-medium">Details</span>
          </div>
          <WidgetSettingsPopup workspaceId={chatId} isRemoteChat={isRemoteChat} />
        </div>

        {/* Widget Cards - rendered in user-defined order */}
        <div className="flex-1 overflow-y-auto py-2">
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

              case "usage":
                return <UsageWidget key="usage" />

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
                    isCommitting={isCommitting}
                    // For remote chats on desktop, don't provide expand/file actions
                    onExpand={canOpenDiff ? onExpandDiff : undefined}
                    onFileSelect={canOpenDiff ? onFileSelect : undefined}
                    diffDisplayMode={diffDisplayMode}
                  />
                )

              default:
                return null
            }
          })}
        </div>
      </div>
    </ResizableSidebar>
  )
}

