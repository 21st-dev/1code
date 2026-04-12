"use client"

import React from "react"
import { useState, useRef, useMemo, useEffect, useCallback, memo, forwardRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "motion/react"
import { DURATION_INSTANT, EASE_OUT, TRANSITION_EXPAND, DURATION_FAST, STAGGER_DELAY, STAGGER_DELAY_CHILDREN } from "../../lib/motion"
import { Button as ButtonCustom } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { useSetAtom, useAtom, useAtomValue } from "jotai"
import {
  autoAdvanceTargetAtom,
  agentsSettingsDialogActiveTabAtom,
  type SettingsTab,
  agentsSidebarOpenAtom,
  agentsHelpPopoverOpenAtom,
  selectedAgentChatIdsAtom,
  isAgentMultiSelectModeAtom,
  toggleAgentChatSelectionAtom,
  selectAllAgentChatsAtom,
  clearAgentChatSelectionAtom,
  selectedAgentChatsCountAtom,
  isDesktopAtom,
  isFullscreenAtom,
  showWorkspaceIconAtom,
  betaKanbanEnabledAtom,
  betaAutomationsEnabledAtom,
} from "../../lib/atoms"
import { ArchivePopover } from "../agents/ui/archive-popover"
import { ChevronDown, MoreHorizontal, Columns3, ArrowUpRight } from "lucide-react"
import { IconChevronRight, IconChevronDown, IconChevronUp, IconArchive, IconPlus, IconFolder, IconFolderOpen, IconSortDescending, IconSettings, IconX, IconSparkles, IconEdit, IconFolderPlus, IconSearch, IconArrowsDiagonalMinimize2, IconDots, IconPointFilled, IconLogin, IconLayoutSidebarLeftCollapse, IconFilter, IconLayoutGrid } from "@tabler/icons-react"
import { Skeleton } from "../../components/ui/skeleton"
import { AgentsRenameSubChatDialog } from "../agents/components/agents-rename-subchat-dialog"
import { ConfirmArchiveDialog } from "../../components/confirm-archive-dialog"
import { trpc, trpcClient } from "../../lib/trpc"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from "../../components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { Kbd } from "../../components/ui/kbd"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from "../../components/ui/context-menu"
import {
  IconDoubleChevronLeft,
  SettingsIcon,
  ProfileIcon,
  PublisherStudioIcon,
  SearchIcon,
  GitHubLogo,
  LoadingDot,
  TrashIcon,
  QuestionCircleIcon,
  QuestionIcon,
  KeyboardIcon,
  TicketIcon,
} from "../../components/ui/icons"
import { Logo } from "../../components/ui/logo"
import { Input } from "../../components/ui/input"
import { Button } from "../../components/ui/button"
import {
  selectedAgentChatIdAtom,
  previousAgentChatIdAtom,
  selectedDraftIdAtom,
  showNewChatFormAtom,
  loadingSubChatsAtom,
  agentsUnseenChangesAtom,
  agentsSubChatUnseenChangesAtom,
  archivePopoverOpenAtom,
  agentsDebugModeAtom,
  selectedProjectAtom,
  justCreatedIdsAtom,
  undoStackAtom,
  pendingUserQuestionsAtom,
  desktopViewAtom,
  expandedWorkspaceIdsAtom,
  subChatFilesAtom,
  type UndoItem,
} from "../agents/atoms"
import { useAgentSubChatStore, OPEN_SUB_CHATS_CHANGE_EVENT, type SubChatMeta } from "../agents/stores/sub-chat-store"
import { getWindowId } from "../../contexts/WindowContext"
import { AgentsHelpPopover } from "../agents/components/agents-help-popover"
import { getShortcutKey, isDesktopApp } from "../../lib/utils/platform"
import { useResolvedHotkeyDisplay, useResolvedHotkeyDisplayWithAlt } from "../../lib/hotkeys"
import { pluralize } from "../agents/utils/pluralize"
import { formatTimeAgo } from "../agents/utils/format-time-ago"
import { useNewChatDrafts, deleteNewChatDraft, type NewChatDraft } from "../agents/lib/drafts"
import {
  TrafficLightSpacer,
  TrafficLights,
} from "../agents/components/traffic-light-spacer"
import { useHotkeys } from "react-hotkeys-hook"
import { Checkbox } from "../../components/ui/checkbox"
import { useHaptic } from "./hooks/use-haptic"
import { TypewriterText } from "../../components/ui/typewriter-text"
import { exportChat, copyChat, type ExportFormat } from "../agents/lib/export-chat"

// Feedback URL: uses env variable for hosted version, falls back to public Discord for open source
const FEEDBACK_URL =
  import.meta.env.VITE_FEEDBACK_URL || "https://discord.gg/8ektTZGnj4"

// GitHub avatar with loading placeholder
const GitHubAvatar = React.memo(function GitHubAvatar({
  gitOwner,
  className = "h-4 w-4",
}: {
  gitOwner: string
  className?: string
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => setIsLoaded(true), [])
  const handleError = useCallback(() => setHasError(true), [])

  // Detect if parent wants rounded-full (circle) style
  const isCircle = className?.includes("rounded-full")

  if (hasError) {
    return <GitHubLogo className={cn(className, "text-muted-foreground flex-shrink-0")} />
  }

  return (
    <div className={cn(className, "relative flex-shrink-0 overflow-hidden")}>
      {/* Placeholder background while loading */}
      {!isLoaded && (
        <div className={cn("absolute inset-0 bg-muted", isCircle ? "rounded-full" : "rounded-sm")} />
      )}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn(className, "flex-shrink-0 object-cover", isCircle ? "rounded-full" : "rounded-sm", isLoaded ? 'opacity-100' : 'opacity-0')}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
})

// Component to render chat icon with loading status
const ChatIcon = React.memo(function ChatIcon({
  isSelected,
  isLoading,
  hasUnseenChanges = false,
  hasPendingPlan = false,
  hasPendingQuestion = false,
  isMultiSelectMode = false,
  isChecked = false,
  onCheckboxClick,
  gitOwner,
  gitProvider,
  showIcon = true,
}: {
  isSelected: boolean
  isLoading: boolean
  hasUnseenChanges?: boolean
  hasPendingPlan?: boolean
  hasPendingQuestion?: boolean
  isMultiSelectMode?: boolean
  isChecked?: boolean
  onCheckboxClick?: (e: React.MouseEvent) => void
  gitOwner?: string | null
  gitProvider?: string | null
  showIcon?: boolean
}) {
  // Show GitHub avatar if available, otherwise blank project icon
  const renderMainIcon = () => {
    if (gitOwner && gitProvider === "github") {
      return <GitHubAvatar gitOwner={gitOwner} />
    }
    return (
      <GitHubLogo
        className={cn(
          "h-4 w-4 flex-shrink-0 transition-colors",
          isSelected ? "text-foreground" : "text-muted-foreground",
        )}
      />
    )
  }

  // When icon is hidden and not in multi-select mode, render nothing
  // The loader/status will be rendered inline by the parent component
  if (!showIcon && !isMultiSelectMode) {
    return null
  }

  return (
    <div className="relative flex-shrink-0 w-4 h-4">
      {/* Checkbox slides in from left, icon slides out */}
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 ease-out",
          isMultiSelectMode
            ? "opacity-100 scale-100"
            : "opacity-0 scale-95 pointer-events-none",
        )}
        onClick={onCheckboxClick}
      >
        <Checkbox
          checked={isChecked}
          className="cursor-pointer h-4 w-4"
          tabIndex={isMultiSelectMode ? 0 : -1}
        />
      </div>
      {/* Main icon fades out when multi-select is active or when showIcon is false */}
      <div
        className={cn(
          "transition-[opacity,transform] duration-150 ease-out",
          isMultiSelectMode || !showIcon
            ? "opacity-0 scale-95 pointer-events-none"
            : "opacity-100 scale-100",
        )}
      >
        {renderMainIcon()}
      </div>
      {/* Badge in bottom-right corner: question > loader > amber dot > blue dot - hidden during multi-select or when icon is hidden */}
      <AnimatePresence mode="wait">
        {(hasPendingQuestion || isLoading || hasUnseenChanges || hasPendingPlan) && !isMultiSelectMode && showIcon && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
            className={cn(
              "absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center",
              isSelected
                ? "bg-[#E8E8E8] dark:bg-[#1B1B1B]"
                : "bg-[#F4F4F4] group-hover:bg-[#E8E8E8] dark:bg-[#101010] dark:group-hover:bg-[#1B1B1B]",
            )}
          >
            {/* Priority: question > loader > amber dot (pending plan) > blue dot (unseen) */}
            <AnimatePresence mode="wait">
              {hasPendingQuestion ? (
                <motion.div
                  key="question"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
                >
                  <QuestionIcon className="w-2.5 h-2.5 text-blue-500" />
                </motion.div>
              ) : isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
                >
                  <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-muted-foreground" />
                </motion.div>
              ) : hasPendingPlan ? (
                <motion.div
                  key="plan"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
                  className="w-1.5 h-1.5 rounded-full bg-amber-500"
                />
              ) : (
                <motion.div
                  key="unseen"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
                >
                  <LoadingDot isLoading={false} className="w-2.5 h-2.5 text-muted-foreground" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})

// Memoized Draft Item component to prevent re-renders on hover
const DraftItem = React.memo(function DraftItem({
  draftId,
  draftText,
  draftUpdatedAt,
  projectGitOwner,
  projectGitProvider,
  projectGitRepo,
  projectName,
  isSelected,
  isMultiSelectMode,
  showIcon,
  onSelect,
  onDelete,
  formatTime,
}: {
  draftId: string
  draftText: string
  draftUpdatedAt: number
  projectGitOwner: string | null | undefined
  projectGitProvider: string | null | undefined
  projectGitRepo: string | null | undefined
  projectName: string | null | undefined
  isSelected: boolean
  isMultiSelectMode: boolean
  showIcon: boolean
  onSelect: (draftId: string) => void
  onDelete: (draftId: string) => void
  formatTime: (dateStr: string) => string
}) {
  return (
    <div
      onClick={() => onSelect(draftId)}
      className={cn(
        "w-full text-left py-[7px] cursor-pointer group relative",
        "transition-colors duration-150 rounded-lg",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isMultiSelectMode ? "px-3" : "pl-[22px] pr-2",
        isSelected
          ? "bg-foreground/[0.08] text-foreground"
          : "text-muted-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        {/* Draft indicator dot */}
        <div className="flex-shrink-0 w-1.5 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500/60" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={cn(
            "truncate block text-[13px] leading-snug flex-1",
            isSelected && "font-medium",
          )}>
            {draftText.slice(0, 50)}
            {draftText.length > 50 ? "..." : ""}
          </span>
          {/* Delete button on hover */}
          {!isMultiSelectMode && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete(draftId)
              }}
              tabIndex={-1}
              className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground transition-[opacity,color] duration-100 opacity-0 group-hover:opacity-100"
              aria-label="Delete draft"
            >
              <TrashIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

// ── Grid Pulse Spinner ─────────────────────────────────────────────────────
// A 2x2 grid of dots that pulse in staggered sequence — used as the loading
// indicator for active sub-chat threads. Much more visually appealing than
// a simple spinning circle at small sizes.
const gridDotVariants = {
  idle: { opacity: 0.15, scale: 0.8 },
  pulse: {
    opacity: [0.15, 1, 0.15],
    scale: [0.8, 1.15, 0.8],
    transition: {
      duration: 1.4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
  // Paused state — dots visible at rest, no animation
  paused: {
    opacity: 0.6,
    scale: 1,
    transition: { duration: 0.3, ease: "easeOut" },
  },
}

const GridPulseSpinner = React.memo(function GridPulseSpinner({
  size = 10,
  className,
  paused = false,
}: {
  size?: number
  className?: string
  paused?: boolean
}) {
  // Each dot is ~38% of container to leave gaps
  const dotSize = Math.max(1, Math.round(size * 0.38))
  const gap = Math.max(1, Math.round(size * 0.12))

  return (
    <motion.div
      animate={paused ? "paused" : "pulse"}
      transition={{ staggerChildren: paused ? 0 : 0.15 }}
      className={cn("inline-grid grid-cols-2 items-center justify-items-center", className)}
      style={{ width: size, height: size, gap }}
    >
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          variants={gridDotVariants}
          className="rounded-full bg-current"
          style={{ width: dotSize, height: dotSize }}
        />
      ))}
    </motion.div>
  )
})

// Memoized Agent Chat Item component to prevent re-renders on hover
const AgentChatItem = React.memo(function AgentChatItem({
  chatId,
  chatName,
  chatBranch,
  chatUpdatedAt,
  chatProjectId,
  globalIndex,
  isSelected,
  isLoading,
  hasUnseenChanges,
  hasPendingPlan,
  hasPendingQuestion,
  isMultiSelectMode,
  isChecked,
  isFocused,
  isDesktop,
  isPinned,
  displayText,
  gitOwner,
  gitProvider,
  stats,
  selectedChatIdsSize,
  canShowPinOption,
  areAllSelectedPinned,
  filteredChatsLength,
  isLastInFilteredChats,
  showIcon,
  onChatClick,
  onCheckboxClick,
  onMouseEnter,
  onMouseLeave,
  onArchive,
  onTogglePin,
  onRenameClick,
  onCopyBranch,
  onArchiveAllBelow,
  onArchiveOthers,
  onBulkPin,
  onBulkUnpin,
  onBulkArchive,
  archivePending,
  archiveBatchPending,
  nameRefCallback,
  formatTime,
  isJustCreated,
  onCreateSubChat,
  accentColor,
  onNavigateToSettings,
  isExpanded,
  onToggleExpand,
}: {
  chatId: string
  chatName: string | null
  chatBranch: string | null
  chatUpdatedAt: Date | null
  chatProjectId: string
  globalIndex: number
  isSelected: boolean
  isLoading: boolean
  hasUnseenChanges: boolean
  hasPendingPlan: boolean
  hasPendingQuestion: boolean
  isMultiSelectMode: boolean
  isChecked: boolean
  isFocused: boolean
  isDesktop: boolean
  isPinned: boolean
  displayText: string
  gitOwner: string | null | undefined
  gitProvider: string | null | undefined
  stats: { fileCount: number; additions: number; deletions: number } | undefined
  selectedChatIdsSize: number
  canShowPinOption: boolean
  areAllSelectedPinned: boolean
  filteredChatsLength: number
  isLastInFilteredChats: boolean
  showIcon: boolean
  onChatClick: (chatId: string, e?: React.MouseEvent, globalIndex?: number) => void
  onCheckboxClick: (e: React.MouseEvent, chatId: string) => void
  onMouseEnter: (chatId: string, chatName: string | null, element: HTMLElement, globalIndex: number) => void
  onMouseLeave: () => void
  onArchive: (chatId: string) => void
  onTogglePin: (chatId: string) => void
  onRenameClick: (chat: { id: string; name: string | null }) => void
  onCopyBranch: (branch: string) => void
  onArchiveAllBelow: (chatId: string) => void
  onArchiveOthers: (chatId: string) => void
  onBulkPin: () => void
  onBulkUnpin: () => void
  onBulkArchive: () => void
  archivePending: boolean
  archiveBatchPending: boolean
  nameRefCallback: (chatId: string, el: HTMLSpanElement | null) => void
  formatTime: (dateStr: string) => string
  isJustCreated: boolean
  onCreateSubChat?: (chatId: string) => void
  accentColor?: string | null
  onNavigateToSettings?: (chatProjectId: string) => void
  isExpanded?: boolean
  onToggleExpand?: () => void
}) {
  // Resolved hotkey for context menu
  const archiveWorkspaceHotkey = useResolvedHotkeyDisplay("archive-workspace")

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-chat-item
          data-chat-index={globalIndex}
          onClick={(e) => {
            onChatClick(chatId, e, globalIndex)
          }}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onChatClick(chatId, undefined, globalIndex)
            }
          }}
          onMouseEnter={(e) => {
            onMouseEnter(chatId, chatName, e.currentTarget, globalIndex)
          }}
          onMouseLeave={onMouseLeave}
          style={accentColor ? {
            borderLeftColor: accentColor,
            backgroundColor: `${accentColor}0a`, // ~4% opacity tint
          } : undefined}
          className={cn(
            "w-full text-left py-1 cursor-pointer group relative",
            "transition-[background-color,color,border-color] duration-150 ease-out",
            "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            // Accent color left border when set
            accentColor ? "border-l-2 rounded-r-md" : "",
            isMultiSelectMode ? "px-3" : "pl-0.5 pr-1",
            isChecked && "bg-primary/10 hover:bg-primary/15 rounded-lg",
          )}
        >
          <div className="flex items-center gap-2">
            {/* Multi-select checkbox or folder icon */}
            {isMultiSelectMode ? (
              <div onClick={(e) => onCheckboxClick(e, chatId)}>
                <Checkbox
                  checked={isChecked}
                  className="cursor-pointer h-4 w-4"
                />
              </div>
            ) : (
              <div
                className="relative flex-shrink-0 group/folder cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleExpand?.()
                }}
              >
                {/* Default icon (avatar or folder); chevron replaces it on hover */}
                <div className="group-hover/folder:hidden">
                  {gitOwner && gitProvider === "github" ? (
                    <GitHubAvatar
                      gitOwner={gitOwner}
                      className={cn(
                        "h-[15px] w-[15px] rounded-full",
                        isSelected ? "opacity-90" : "opacity-50",
                      )}
                    />
                  ) : isExpanded ? (
                    <IconFolderOpen
                      size={15}
                      stroke={1.5}
                      className={cn(
                        "transition-colors duration-150",
                        isSelected ? "text-foreground/90" : "text-muted-foreground/50",
                      )}
                    />
                  ) : (
                    <IconFolder
                      size={15}
                      stroke={1.5}
                      className={cn(
                        "transition-colors duration-150",
                        isSelected ? "text-foreground/90" : "text-muted-foreground/50",
                      )}
                    />
                  )}
                </div>
                {/* Chevron on hover — up when expanded, down when collapsed */}
                <div className="hidden group-hover/folder:block">
                  {isExpanded ? (
                    <IconChevronUp size={15} stroke={1.5} className="text-muted-foreground/60" />
                  ) : (
                    <IconChevronDown size={15} stroke={1.5} className="text-muted-foreground/60" />
                  )}
                </div>
                {/* Status badge — only show for pending questions (Codex-minimal) */}
                {hasPendingQuestion && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-blue-500" />
                )}
              </div>
            )}
            {/* Workspace name — Codex style, no subtitle */}
            <div className="flex-1 min-w-0">
              <span
                ref={(el) => nameRefCallback(chatId, el)}
                className={cn(
                  "truncate block text-[13px] leading-snug",
                  isSelected ? "text-foreground font-medium" : "text-muted-foreground/80 group-hover:text-foreground",
                )}
              >
                <TypewriterText
                  text={chatName || ""}
                  placeholder="New workspace"
                  id={chatId}
                  isJustCreated={isJustCreated}
                  showPlaceholder={true}
                />
              </span>
            </div>
            {/* Workspace hover actions — Codex style: three dots + new thread */}
            {!isMultiSelectMode && (
              <div className="flex-shrink-0 flex items-center gap-0.5 transition-[opacity,transform] duration-150 ease-out opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRenameClick({ id: chatId, name: chatName })
                  }}
                  tabIndex={-1}
                  className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.08] transition-[background-color,color] duration-150 ease-out"
                  aria-label="More options"
                >
                  <IconDots size={14} stroke={1.8} />
                </button>
                {onCreateSubChat && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onCreateSubChat(chatId)
                    }}
                    tabIndex={-1}
                    className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.08] transition-[background-color,color] duration-150 ease-out"
                    aria-label="New thread"
                  >
                    <IconEdit size={13} stroke={1.8} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {/* Multi-select context menu */}
        {isMultiSelectMode && isChecked ? (
          <>
            {canShowPinOption && (
              <>
                <ContextMenuItem onClick={areAllSelectedPinned ? onBulkUnpin : onBulkPin}>
                  {areAllSelectedPinned
                    ? `Unpin ${selectedChatIdsSize} ${pluralize(selectedChatIdsSize, "workspace")}`
                    : `Pin ${selectedChatIdsSize} ${pluralize(selectedChatIdsSize, "workspace")}`}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}
            <ContextMenuItem onClick={onBulkArchive} disabled={archiveBatchPending}>
              {archiveBatchPending
                ? "Archiving..."
                : `Archive ${selectedChatIdsSize} ${pluralize(selectedChatIdsSize, "workspace")}`}
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onClick={() => onTogglePin(chatId)}>
              {isPinned ? "Unpin workspace" : "Pin workspace"}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onRenameClick({ id: chatId, name: chatName })}>
              Rename workspace
            </ContextMenuItem>
            {chatBranch && (
              <ContextMenuItem onClick={() => onCopyBranch(chatBranch)}>
                Copy branch name
              </ContextMenuItem>
            )}
            <ContextMenuSub>
              <ContextMenuSubTrigger>Export workspace</ContextMenuSubTrigger>
              <ContextMenuSubContent sideOffset={6} alignOffset={-4}>
                <ContextMenuItem onClick={() => exportChat({ chatId, format: "markdown" })}>
                  Download as Markdown
                </ContextMenuItem>
                <ContextMenuItem onClick={() => exportChat({ chatId, format: "json" })}>
                  Download as JSON
                </ContextMenuItem>
                <ContextMenuItem onClick={() => exportChat({ chatId, format: "text" })}>
                  Download as Text
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => copyChat({ chatId, format: "markdown" })}>
                  Copy as Markdown
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyChat({ chatId, format: "json" })}>
                  Copy as JSON
                </ContextMenuItem>
                <ContextMenuItem onClick={() => copyChat({ chatId, format: "text" })}>
                  Copy as Text
                </ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
            {isDesktop && (
              <ContextMenuItem onClick={async () => {
                const result = await window.desktopApi?.newWindow({ chatId })
                if (result?.blocked) {
                  toast.info("This workspace is already open in another window", {
                    description: "Switching to the existing window.",
                    duration: 3000,
                  })
                }
              }}>
                Open in new window
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onArchive(chatId)} className="justify-between">
              Archive workspace
              {archiveWorkspaceHotkey && <Kbd>{archiveWorkspaceHotkey}</Kbd>}
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onArchiveAllBelow(chatId)}
              disabled={isLastInFilteredChats}
            >
              Archive all below
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => onArchiveOthers(chatId)}
              disabled={filteredChatsLength === 1}
            >
              Archive others
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
})

// Memoized Sub-Chat Item - renders an indented sub-chat row within a workspace group
const SubChatItem = React.memo(function SubChatItem({
  subChat,
  isActive,
  isLoading,
  hasUnseenChanges,
  onSelect,
  onArchive,
  accentColor,
  additions,
  deletions,
  updatedAt,
}: {
  subChat: SubChatMeta
  isActive: boolean
  isLoading: boolean
  hasUnseenChanges: boolean
  onSelect: (subChat: SubChatMeta) => void
  onArchive: (subChatId: string) => void
  accentColor?: string | null
  additions?: number
  deletions?: number
  updatedAt?: string
}) {
  // Show metadata line if we have file stats or a timestamp
  const hasStats = (additions ?? 0) > 0 || (deletions ?? 0) > 0
  const hasMetadata = hasStats || !!updatedAt

  return (
    <div
      onClick={() => onSelect(subChat)}
      style={accentColor ? {
        borderLeftColor: accentColor,
        backgroundColor: isActive ? `${accentColor}12` : undefined, // Stronger tint when active
      } : undefined}
      className={cn(
        "w-full text-left py-[6px] pl-[20px] pr-2 cursor-pointer group/subchat relative",
        "transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out rounded-md",
        // Accent color left border for visual grouping
        accentColor ? "border-l-2 rounded-l-none" : "",
        isActive
          ? accentColor ? "text-foreground" : "bg-foreground/[0.08] text-foreground"
          : "text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground",
      )}
    >
      <div className="flex items-center gap-2">
        {/* Thread status indicator — always visible: animated when loading, paused when idle */}
        <div className="flex-shrink-0 w-[10px] flex items-center justify-center">
          {hasUnseenChanges ? (
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          ) : (
            <GridPulseSpinner
              size={10}
              className={cn(
                isLoading ? "text-muted-foreground" : isActive ? "text-muted-foreground/30" : "text-muted-foreground/15",
              )}
              paused={!isLoading}
            />
          )}
        </div>
        <span className={cn(
          "truncate text-[12px] leading-snug flex-1",
          isActive ? "font-medium text-foreground" : "",
        )}>
          {subChat.name || "New Chat"}
        </span>
        {/* Time ago — Codex style, right-aligned, fades out on hover */}
        {updatedAt && (
          <span className="flex-shrink-0 text-[11px] text-muted-foreground/45 tabular-nums transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out group-hover/subchat:opacity-0 group-hover/subchat:-translate-x-1">
            {formatTimeAgo(updatedAt)}
          </span>
        )}
        {/* Archive button on hover — slides in from right */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onArchive(subChat.id)
          }}
          tabIndex={-1}
          className="absolute right-2 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/25 hover:text-foreground/70 hover:bg-foreground/[0.08] transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out opacity-0 translate-x-1 group-hover/subchat:opacity-100 group-hover/subchat:translate-x-0 active:scale-90"
          aria-label="Archive thread"
        >
          <IconArchive size={12} stroke={1.8} />
        </button>
      </div>
    </div>
  )
})

// ── Confirm Thread Archive Dialog ────────────────────────────────────────
// Lightweight confirmation modal before deleting a sub-chat thread
const ConfirmThreadArchiveDialog = React.memo(function ConfirmThreadArchiveDialog({
  isOpen,
  threadName,
  onClose,
  onConfirm,
  isPending,
}: {
  isOpen: boolean
  threadName: string
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const openAtRef = useRef<number>(0)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (isOpen) openAtRef.current = performance.now()
  }, [isOpen])

  // Auto-focus confirm button when dialog opens
  const handleAnimationComplete = useCallback(() => {
    if (isOpen) confirmRef.current?.focus()
  }, [isOpen])

  // Prevent accidental immediate clicks (250ms grace period)
  const canInteract = useCallback(() => {
    return performance.now() - openAtRef.current > 250
  }, [])

  const handleClose = useCallback(() => {
    if (!canInteract()) return
    onClose()
  }, [canInteract, onClose])

  const handleConfirm = useCallback(() => {
    if (!canInteract()) return
    onConfirm()
  }, [canInteract, onConfirm])

  // Keyboard: Escape to close, Enter to confirm
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); handleClose() }
      if (e.key === "Enter") { e.preventDefault(); handleConfirm() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, handleClose, handleConfirm])

  if (!mounted) return null
  const portalTarget = typeof document !== "undefined" ? document.body : null
  if (!portalTarget) return null

  const EASING = [0.55, 0.055, 0.675, 0.19] as const

  return createPortal(
    <AnimatePresence mode="wait" initial={false}>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.18, ease: EASING } }}
            exit={{ opacity: 0, pointerEvents: "none" as const, transition: { duration: 0.15, ease: EASING } }}
            className="fixed inset-0 z-[45] bg-black/25"
            onClick={handleClose}
            style={{ pointerEvents: "auto" }}
          />
          {/* Dialog */}
          <div className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[46] pointer-events-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2, ease: EASING }}
              onAnimationComplete={handleAnimationComplete}
              className="w-[90vw] max-w-[380px] pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-background rounded-2xl border shadow-2xl overflow-hidden" data-canvas-dialog>
                <div className="p-6">
                  <h2 className="text-lg font-semibold mb-2">Archive Thread</h2>
                  <p className="text-sm text-muted-foreground">
                    Are you sure you want to archive{" "}
                    <span className="font-medium text-foreground">
                      {threadName || "this thread"}
                    </span>
                    ? This will permanently remove it and its messages.
                  </p>
                </div>
                <div className="bg-muted p-4 flex justify-between border-t border-border rounded-b-xl">
                  <ButtonCustom onClick={handleClose} variant="ghost" className="rounded-md">
                    Cancel
                  </ButtonCustom>
                  <ButtonCustom
                    ref={confirmRef}
                    onClick={handleConfirm}
                    variant="destructive"
                    className="rounded-md"
                    disabled={isPending}
                  >
                    {isPending ? "Archiving..." : "Archive"}
                  </ButtonCustom>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    portalTarget,
  )
})

// Renders the sub-chat list for an expanded workspace
const WorkspaceSubChats = React.memo(function WorkspaceSubChats({
  chatId,
  searchQuery,
  onSubChatSelect,
  accentColor,
}: {
  chatId: string
  searchQuery?: string
  onSubChatSelect: (workspaceId: string, subChat: SubChatMeta) => void
  accentColor?: string | null
}) {
  // Fetch sub-chats from tRPC for this workspace
  const { data: chatData, isLoading: isLoadingChatData } = trpc.chats.get.useQuery(
    { id: chatId },
  )

  const utils = trpc.useUtils()
  const loadingSubChats = useAtomValue(loadingSubChatsAtom)
  const unseenChanges = useAtomValue(agentsSubChatUnseenChangesAtom)
  const subChatFiles = useAtomValue(subChatFilesAtom)
  const activeSubChatId = useAgentSubChatStore((state) => state.activeSubChatId)
  const selectedChatId = useAtomValue(selectedAgentChatIdAtom)

  // Confirmation dialog state for thread archive
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null)
  const archiveConfirmName = useMemo(() => {
    if (!archiveConfirmId || !chatData?.subChats) return ""
    return chatData.subChats.find((sc) => sc.id === archiveConfirmId)?.name ?? "Untitled"
  }, [archiveConfirmId, chatData?.subChats])

  // Delete sub-chat mutation — actually removes from the database
  const deleteSubChatMutation = trpc.chats.deleteSubChat.useMutation({
    onSuccess: () => {
      if (archiveConfirmId) {
        // Remove from Zustand open tabs + allSubChats
        useAgentSubChatStore.getState().removeFromOpenSubChats(archiveConfirmId)
        // Invalidate the workspace query so the list refreshes
        utils.chats.get.invalidate({ id: chatId })
      }
      setArchiveConfirmId(null)
    },
    onError: () => {
      toast.error("Failed to archive thread")
      setArchiveConfirmId(null)
    },
  })

  // Sort sub-chats by most recent first, then filter by search query
  const subChats = useMemo(() => {
    if (!chatData?.subChats) return []
    const sorted = [...chatData.subChats].sort((a, b) => {
      const aT = new Date(a.updatedAt || a.createdAt || "0").getTime()
      const bT = new Date(b.updatedAt || b.createdAt || "0").getTime()
      return bT - aT
    })
    // Apply search filter if provided
    if (searchQuery?.trim()) {
      const query = searchQuery.toLowerCase()
      return sorted.filter((sc) =>
        (sc.name ?? "").toLowerCase().includes(query),
      )
    }
    return sorted
  }, [chatData?.subChats, searchQuery])

  // Show confirmation dialog before archiving
  const handleArchiveSubChat = useCallback((subChatId: string) => {
    setArchiveConfirmId(subChatId)
  }, [])

  // Confirm the archive — actually delete the sub-chat
  const handleConfirmArchive = useCallback(() => {
    if (!archiveConfirmId) return
    deleteSubChatMutation.mutate({ id: archiveConfirmId })
  }, [archiveConfirmId, deleteSubChatMutation])

  // Skeleton loading rows while fetching sub-chats
  if (isLoadingChatData && !chatData) {
    return (
      <div className="py-px space-y-px">
        {[1, 2].map((i) => (
          <div key={i} className="pl-[20px] pr-2 py-[6px]">
            <Skeleton
              className="h-[14px] rounded-sm"
              style={{ width: i === 1 ? "65%" : "45%" }}
            />
          </div>
        ))}
      </div>
    )
  }

  if (!chatData?.subChats || chatData.subChats.length === 0) {
    return (
      <div className="pl-[20px] pr-2 py-[5px]">
        <span className="text-[11px] text-muted-foreground/40 italic">No threads</span>
      </div>
    )
  }

  // All sub-chats filtered out by search
  if (subChats.length === 0) {
    return null
  }

  return (
    <>
      <motion.div
        className="py-px"
        initial="collapsed"
        animate="open"
        variants={{
          collapsed: {},
          open: {
            transition: { staggerChildren: STAGGER_DELAY, delayChildren: STAGGER_DELAY_CHILDREN },
          },
        }}
      >
        {subChats.map((sc) => {
          // Compute file change stats from subChatFilesAtom
          const fileChanges = subChatFiles.get(sc.id) || []
          const stats = fileChanges.length > 0
            ? fileChanges.reduce(
                (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
                { additions: 0, deletions: 0 },
              )
            : null

          return (
            <motion.div
              key={sc.id}
              variants={{
                collapsed: { opacity: 0, y: -3 },
                open: { opacity: 1, y: 0 },
              }}
              transition={{ duration: DURATION_FAST, ease: EASE_OUT }}
            >
              <SubChatItem
                subChat={{
                  id: sc.id,
                  name: sc.name ?? "New Chat",
                  created_at: sc.createdAt?.toISOString() ?? new Date().toISOString(),
                  updated_at: sc.updatedAt?.toISOString() ?? undefined,
                  mode: sc.mode as "agent" | "plan" | undefined,
                }}
                isActive={selectedChatId === chatId && activeSubChatId === sc.id}
                isLoading={loadingSubChats.has(sc.id)}
                hasUnseenChanges={unseenChanges.has(sc.id)}
                onSelect={(subChat) => onSubChatSelect(chatId, subChat)}
                onArchive={handleArchiveSubChat}
                accentColor={accentColor}
                additions={stats?.additions}
                deletions={stats?.deletions}
                updatedAt={sc.updatedAt?.toISOString() ?? undefined}
              />
            </motion.div>
          )
        })}
      </motion.div>

      {/* Thread archive confirmation dialog */}
      <ConfirmThreadArchiveDialog
        isOpen={archiveConfirmId !== null}
        threadName={archiveConfirmName}
        onClose={() => setArchiveConfirmId(null)}
        onConfirm={handleConfirmArchive}
        isPending={deleteSubChatMutation.isPending}
      />
    </>
  )
})

interface AgentsSidebarProps {
  desktopUser?: { id: string; email: string; name?: string } | null
  onSignOut?: () => void
  onToggleSidebar?: (e?: React.MouseEvent) => void
}

// Memoized Archive Button to prevent re-creation on every sidebar render
const ArchiveButton = memo(forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function ArchiveButton(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        {...props}
      >
        <IconArchive size={18} stroke={1.5} />
      </button>
    )
  }
))

// Isolated Kanban Button - clears selection to show Kanban view
const KanbanButton = memo(function KanbanButton() {
  const kanbanEnabled = useAtomValue(betaKanbanEnabledAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)

  // Resolved hotkey for tooltip (respects custom bindings)
  const openKanbanHotkey = useResolvedHotkeyDisplay("open-kanban")

  const handleClick = useCallback(() => {
    // Clear selected chat, draft, and new form state to show Kanban view
    setSelectedChatId(null)
    setSelectedDraftId(null)
    setShowNewChatForm(false)
    setDesktopView(null) // Clear automations/inbox view
  }, [setSelectedChatId, setSelectedDraftId, setShowNewChatForm, setDesktopView])

  // Hide button if feature is disabled
  if (!kanbanEnabled) return null

  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        >
          <Columns3 className="h-[18px] w-[18px]" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        Kanban View
        {openKanbanHotkey && <Kbd>{openKanbanHotkey}</Kbd>}
      </TooltipContent>
    </Tooltip>
  )
})

// Custom SVG icons matching web's icons.tsx
function SidebarInboxIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M3 12H7.5C8.12951 12 8.72229 12.2964 9.1 12.8L9.4 13.2C9.77771 13.7036 10.3705 14 11 14H13C13.6295 14 14.2223 13.7036 14.6 13.2L14.9 12.8C15.2777 12.2964 15.8705 12 16.5 12H21M21.7365 11.5389L18.5758 6.00772C18.2198 5.38457 17.5571 5 16.8394 5H7.16065C6.44293 5 5.78024 5.38457 5.42416 6.00772L2.26351 11.5389C2.09083 11.841 2 12.1831 2 12.5311V17C2 18.1046 2.89543 19 4 19H20C21.1046 19 22 18.1046 22 17V12.5311C22 12.1831 21.9092 11.841 21.7365 11.5389Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SidebarAutomationsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M9.50006 5.39844C7.09268 6.1897 5.1897 8.09268 4.39844 10.5001M19.8597 14.5001C19.9518 14.0142 20.0001 13.5128 20.0001 13.0001C20.0001 10.9895 19.2584 9.1522 18.0337 7.74679M6.70841 19.0001C8.11868 20.2448 9.97117 21.0001 12.0001 21.0001C12.5127 21.0001 13.0141 20.9518 13.5 20.8597"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="5" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="20" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="4" cy="17" r="2.5" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

// Isolated Inbox Button - full-width navigation link matching web layout
const InboxButton = memo(function InboxButton() {
  const automationsEnabled = useAtomValue(betaAutomationsEnabledAtom)
  const desktopView = useAtomValue(desktopViewAtom)
  const setSelectedChatId = useSetAtom(selectedAgentChatIdAtom)
  const setSelectedDraftId = useSetAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const handleClick = useCallback(() => {
    setSelectedChatId(null)
    setSelectedDraftId(null)
    setShowNewChatForm(false)
    setDesktopView("inbox")
  }, [setSelectedChatId, setSelectedDraftId, setShowNewChatForm, setDesktopView])

  if (!automationsEnabled) return null

  const isActive = desktopView === "inbox"

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out border border-border/50",
        isActive
          ? "bg-foreground/[0.08] text-foreground/90 border-border/60"
          : "text-muted-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground hover:border-border/70 active:scale-[0.98]",
      )}
    >
      <SidebarInboxIcon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 text-left font-medium">Inbox</span>
    </button>
  )
})

// Isolated Automations Button - full-width navigation link matching web layout
const AutomationsButton = memo(function AutomationsButton() {
  const automationsEnabled = useAtomValue(betaAutomationsEnabledAtom)

  const handleClick = useCallback(() => {
    window.desktopApi.openExternal("https://21st.dev/agents/app/automations")
  }, [])

  if (!automationsEnabled) return null

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-[13px] transition-[background-color,color,border-color,opacity,transform] duration-150 ease-out border border-border/50",
        "text-muted-foreground/80 hover:bg-foreground/[0.06] hover:text-foreground hover:border-border/70 active:scale-[0.98]",
      )}
    >
      <SidebarAutomationsIcon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 text-left font-medium">Automations</span>
      <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
    </button>
  )
})

// Isolated Archive Section - subscribes to archivePopoverOpenAtom internally
// to prevent sidebar re-renders when popover opens/closes
interface ArchiveSectionProps {
  archivedChatsCount: number
}

const ArchiveSection = memo(function ArchiveSection({ archivedChatsCount }: ArchiveSectionProps) {
  const archivePopoverOpen = useAtomValue(archivePopoverOpenAtom)
  const [blockArchiveTooltip, setBlockArchiveTooltip] = useState(false)
  const prevArchivePopoverOpen = useRef(false)
  const archiveButtonRef = useRef<HTMLButtonElement>(null)

  // Handle tooltip blocking when popover closes
  useEffect(() => {
    if (prevArchivePopoverOpen.current && !archivePopoverOpen) {
      archiveButtonRef.current?.blur()
      setBlockArchiveTooltip(true)
      const timer = setTimeout(() => setBlockArchiveTooltip(false), 300)
      prevArchivePopoverOpen.current = archivePopoverOpen
      return () => clearTimeout(timer)
    }
    prevArchivePopoverOpen.current = archivePopoverOpen
  }, [archivePopoverOpen])

  if (archivedChatsCount === 0) return null

  return (
    <Tooltip
      delayDuration={500}
      open={archivePopoverOpen || blockArchiveTooltip ? false : undefined}
    >
      <TooltipTrigger asChild>
        <div>
          <ArchivePopover
            trigger={<ArchiveButton ref={archiveButtonRef} />}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>Archive</TooltipContent>
    </Tooltip>
  )
})

// Isolated Sidebar Header - contains dropdown, traffic lights, close button
// Subscribes to dropdown state internally to prevent sidebar re-renders
interface SidebarHeaderProps {
  isDesktop: boolean
  isFullscreen: boolean | null
  desktopUser: { id: string; email: string; name?: string } | null
  onSignOut: () => void
  onToggleSidebar?: (e?: React.MouseEvent) => void
  setSettingsDialogOpen: (open: boolean) => void
  setSettingsActiveTab: (tab: SettingsTab) => void
  handleSidebarMouseEnter: () => void
  handleSidebarMouseLeave: (e: React.MouseEvent) => void
  closeButtonRef: React.RefObject<HTMLDivElement | null>
  onSearchClick?: () => void
}

const SidebarHeader = memo(function SidebarHeader({
  isDesktop,
  isFullscreen,
  handleSidebarMouseEnter,
  handleSidebarMouseLeave,
  onSearchClick,
}: SidebarHeaderProps) {
  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      {/* Spacer for macOS traffic lights — pushes sidebar content below the title bar */}
      <TrafficLightSpacer isFullscreen={isFullscreen} isDesktop={isDesktop} />

      {/* Search icon — positioned in the title bar row, right of the layout toggle (managed by AgentsLayout) */}
      {isDesktop && !isFullscreen && (
        <div
          className="absolute top-[8px] z-10"
          style={{
            left: 118,
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onSearchClick}
                className="flex items-center justify-center h-6 w-6 rounded text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.08] transition-colors duration-150"
                aria-label="Search"
              >
                <IconSearch size={14} stroke={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Search</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
})

// Isolated Help Section - subscribes to agentsHelpPopoverOpenAtom internally
// to prevent sidebar re-renders when popover opens/closes
interface HelpSectionProps {
  isMobile: boolean
}

const HelpSection = memo(function HelpSection({ isMobile }: HelpSectionProps) {
  const [helpPopoverOpen, setHelpPopoverOpen] = useAtom(agentsHelpPopoverOpenAtom)
  const [blockHelpTooltip, setBlockHelpTooltip] = useState(false)
  const prevHelpPopoverOpen = useRef(false)
  const helpButtonRef = useRef<HTMLButtonElement>(null)

  // Handle tooltip blocking when popover closes
  useEffect(() => {
    if (prevHelpPopoverOpen.current && !helpPopoverOpen) {
      helpButtonRef.current?.blur()
      setBlockHelpTooltip(true)
      const timer = setTimeout(() => setBlockHelpTooltip(false), 300)
      prevHelpPopoverOpen.current = helpPopoverOpen
      return () => clearTimeout(timer)
    }
    prevHelpPopoverOpen.current = helpPopoverOpen
  }, [helpPopoverOpen])

  return (
    <Tooltip
      delayDuration={500}
      open={helpPopoverOpen || blockHelpTooltip ? false : undefined}
    >
      <TooltipTrigger asChild>
        <div>
          <AgentsHelpPopover
            open={helpPopoverOpen}
            onOpenChange={setHelpPopoverOpen}
            isMobile={isMobile}
          >
            <button
              ref={helpButtonRef}
              type="button"
              className="flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-foreground/[0.05] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
              suppressHydrationWarning
            >
              <QuestionCircleIcon className="h-[18px] w-[18px]" />
            </button>
          </AgentsHelpPopover>
        </div>
      </TooltipTrigger>
      <TooltipContent>Help</TooltipContent>
    </Tooltip>
  )
})

export function AgentsSidebar({
  desktopUser = {
    id: "demo-user-id",
    email: "demo@example.com",
    name: "Demo User",
  },
  onSignOut = () => {},
  onToggleSidebar,
}: AgentsSidebarProps) {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const previousChatId = useAtomValue(previousAgentChatIdAtom)
  const autoAdvanceTarget = useAtomValue(autoAdvanceTargetAtom)
  const [selectedDraftId, setSelectedDraftId] = useAtom(selectedDraftIdAtom)
  const setShowNewChatForm = useSetAtom(showNewChatFormAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const [loadingSubChats] = useAtom(loadingSubChatsAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  // Use ref instead of state to avoid re-renders on hover
  const isSidebarHoveredRef = useRef(false)
  const closeButtonRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortMode, setSortMode] = useState<"recent" | "alpha">("recent") // Sort toggle: recent first or alphabetical
  const [focusedChatIndex, setFocusedChatIndex] = useState<number>(-1) // -1 means no focus
  const hoveredChatIndexRef = useRef<number>(-1) // Track hovered chat for X hotkey - ref to avoid re-renders

  // Global desktop/fullscreen state from atoms (initialized in AgentsLayout)
  const isDesktop = useAtomValue(isDesktopAtom)
  const isFullscreen = useAtomValue(isFullscreenAtom)

  // Multi-select state
  const [selectedChatIds, setSelectedChatIds] = useAtom(
    selectedAgentChatIdsAtom,
  )
  const isMultiSelectMode = useAtomValue(isAgentMultiSelectModeAtom)
  const selectedChatsCount = useAtomValue(selectedAgentChatsCountAtom)
  const toggleChatSelection = useSetAtom(toggleAgentChatSelectionAtom)
  const selectAllChats = useSetAtom(selectAllAgentChatsAtom)
  const clearChatSelection = useSetAtom(clearAgentChatSelectionAtom)

  // Scroll gradient refs - use DOM manipulation to avoid re-renders
  const topGradientRef = useRef<HTMLDivElement>(null)
  const bottomGradientRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Multiple drafts state - uses event-based sync instead of polling
  const drafts = useNewChatDrafts()

  // Read unseen changes from global atoms
  const unseenChanges = useAtomValue(agentsUnseenChangesAtom)
  const justCreatedIds = useAtomValue(justCreatedIdsAtom)

  // Haptic feedback
  const { trigger: triggerHaptic } = useHaptic()

  // Resolved hotkeys for tooltips
  const { primary: newWorkspaceHotkey, alt: newWorkspaceAltHotkey } = useResolvedHotkeyDisplayWithAlt("new-workspace")
  const settingsHotkey = useResolvedHotkeyDisplay("open-settings")

  // Rename dialog state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingChat, setRenamingChat] = useState<{
    id: string
    name: string
  } | null>(null)
  const [renameLoading, setRenameLoading] = useState(false)

  // Confirm archive dialog state
  const [confirmArchiveDialogOpen, setConfirmArchiveDialogOpen] = useState(false)
  const [archivingChatId, setArchivingChatId] = useState<string | null>(null)
  const [activeProcessCount, setActiveProcessCount] = useState(0)
  const [hasWorktree, setHasWorktree] = useState(false)
  const [uncommittedCount, setUncommittedCount] = useState(0)

  // Track initial mount to skip footer animation on load
  const hasFooterAnimated = useRef(false)

  // Pinned chats (stored in localStorage per project)
  const [pinnedChatIds, setPinnedChatIds] = useState<Set<string>>(new Set())
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Agent name tooltip refs (for truncated names) - using DOM manipulation to avoid re-renders
  const agentTooltipRef = useRef<HTMLDivElement>(null)
  const nameRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const agentTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const setDesktopViewForSettings = useSetAtom(desktopViewAtom)
  const setSidebarOpenForSettings = useSetAtom(agentsSidebarOpenAtom)
  // Navigate to settings page instead of opening a dialog
  const setSettingsDialogOpen = useCallback((open: boolean) => {
    if (open) {
      setDesktopViewForSettings("settings")
      setSidebarOpenForSettings(true)
    } else {
      setDesktopViewForSettings(null)
    }
  }, [setDesktopViewForSettings, setSidebarOpenForSettings])
  // Debug mode for testing first-time user experience
  const debugMode = useAtomValue(agentsDebugModeAtom)

  // Sidebar appearance settings
  const showWorkspaceIcon = useAtomValue(showWorkspaceIconAtom)

  // Desktop: use selectedProject instead of teams
  const [selectedProject, setSelectedProject] = useAtom(selectedProjectAtom)

  // Get tRPC utils early — needed for cache invalidation in callbacks below
  const utils = trpc.useUtils()

  // ── Hierarchical sidebar: expanded workspaces state ──────────────────────
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useAtom(expandedWorkspaceIdsAtom)
  const expandedSet = useMemo(() => new Set(expandedWorkspaceIds), [expandedWorkspaceIds])

  // Toggle workspace expansion (collapse if expanded, expand if collapsed)
  const handleToggleExpand = useCallback((chatId: string) => {
    setExpandedWorkspaceIds((prev) => {
      const set = new Set(prev)
      if (set.has(chatId)) {
        set.delete(chatId)
      } else {
        set.add(chatId)
      }
      return Array.from(set)
    })
  }, [setExpandedWorkspaceIds])

  // Collapse all expanded workspaces
  const handleCollapseAll = useCallback(() => {
    setExpandedWorkspaceIds([])
  }, [setExpandedWorkspaceIds])

  // Toggle sort mode between recent and alphabetical
  const handleToggleSort = useCallback(() => {
    setSortMode((prev) => (prev === "recent" ? "alpha" : "recent"))
  }, [])

  // Auto-expand workspace only when a *different* chat is selected
  // (not when the expanded set changes, which would fight user collapse)
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedChatId && selectedChatId !== prevSelectedRef.current) {
      prevSelectedRef.current = selectedChatId
      setExpandedWorkspaceIds((prev) => {
        if (prev.includes(selectedChatId)) return prev
        return [...prev, selectedChatId]
      })
    }
  }, [selectedChatId, setExpandedWorkspaceIds])

  // Handle sub-chat selection from the hierarchy tree
  const handleSubChatSelect = useCallback((workspaceId: string, subChat: SubChatMeta) => {
    setSelectedChatId(workspaceId)

    // Set the sub-chat as active in the store
    const store = useAgentSubChatStore.getState()
    store.setChatId(workspaceId)
    if (!store.openSubChatIds.includes(subChat.id)) {
      store.addToOpenSubChats(subChat.id)
    }
    store.setActiveSubChat(subChat.id)

    // Claim chat in desktop (prevent other windows from opening same chat)
    window.desktopApi?.claimChat(workspaceId)
  }, [setSelectedChatId])

  // Create a new sub-chat within a workspace
  const handleCreateSubChat = useCallback(async (workspaceId: string) => {
    try {
      const newSubChat = await trpcClient.chats.createSubChat.mutate({
        chatId: workspaceId,
        name: "Untitled",
        mode: "agent",
      })

      // Expand the workspace if not already expanded
      setExpandedWorkspaceIds((prev) => {
        if (prev.includes(workspaceId)) return prev
        return [...prev, workspaceId]
      })

      // Set the workspace as selected and navigate to the new sub-chat
      setSelectedChatId(workspaceId)
      const store = useAgentSubChatStore.getState()
      store.setChatId(workspaceId)
      store.addToAllSubChats({
        id: newSubChat.id,
        name: "Untitled",
        created_at: new Date().toISOString(),
        mode: "agent",
      })
      store.addToOpenSubChats(newSubChat.id)
      store.setActiveSubChat(newSubChat.id)
      window.desktopApi?.claimChat(workspaceId)

      // Invalidate the chat query so WorkspaceSubChats re-fetches and shows the new thread
      utils.chats.get.invalidate({ id: workspaceId })
    } catch (err) {
      toast.error("Failed to create chat")
    }
  }, [setExpandedWorkspaceIds, setSelectedChatId, utils])

  // Fetch all local chats (no project filter)
  const { data: localChats } = trpc.chats.list.useQuery({})

  // Map local chats to unified format, sorted by most recent
  const agentChats = useMemo(() => {
    if (!localChats) return []

    return [...localChats]
      .sort((a, b) => {
        const aTime = a.updatedAt?.getTime() ?? 0
        const bTime = b.updatedAt?.getTime() ?? 0
        return bTime - aTime
      })
  }, [localChats])

  // Track open sub-chat changes for reactivity
  const [openSubChatsVersion, setOpenSubChatsVersion] = useState(0)
  useEffect(() => {
    const handleChange = () => setOpenSubChatsVersion((v) => v + 1)
    window.addEventListener(OPEN_SUB_CHATS_CHANGE_EVENT, handleChange)
    return () => window.removeEventListener(OPEN_SUB_CHATS_CHANGE_EVENT, handleChange)
  }, [])

  // Store previous value to avoid unnecessary React Query refetches
  const prevOpenSubChatIdsRef = useRef<string[]>([])

  // Collect all open sub-chat IDs from localStorage for all workspaces
  const allOpenSubChatIds = useMemo(() => {
    // openSubChatsVersion is used to trigger recalculation when sub-chats change
    void openSubChatsVersion
    if (!agentChats) return prevOpenSubChatIdsRef.current

    const windowId = getWindowId()
    const allIds: string[] = []
    for (const chat of agentChats) {
      try {
        // Use window-prefixed key (matches sub-chat-store.ts)
        const stored = localStorage.getItem(`${windowId}:agent-open-sub-chats-${chat.id}`)
        if (stored) {
          const ids = JSON.parse(stored) as string[]
          allIds.push(...ids)
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Compare with previous - if content is same, return old reference
    // This prevents React Query from refetching when array content hasn't changed
    const prev = prevOpenSubChatIdsRef.current
    const sorted = [...allIds].sort()
    const prevSorted = [...prev].sort()
    if (sorted.length === prevSorted.length && sorted.every((id, i) => id === prevSorted[i])) {
      return prev
    }

    prevOpenSubChatIdsRef.current = allIds
    return allIds
  }, [agentChats, openSubChatsVersion])

  // File changes stats from DB - only for open sub-chats
  const { data: fileStatsData } = trpc.chats.getFileStats.useQuery(
    { openSubChatIds: allOpenSubChatIds },
    { refetchInterval: 5000, enabled: allOpenSubChatIds.length > 0, placeholderData: (prev) => prev }
  )

  // Pending plan approvals from DB - only for open sub-chats
  const { data: pendingPlanApprovalsData } = trpc.chats.getPendingPlanApprovals.useQuery(
    { openSubChatIds: allOpenSubChatIds },
    { refetchInterval: 5000, enabled: allOpenSubChatIds.length > 0, placeholderData: (prev) => prev }
  )

  // Fetch all projects for git info
  const { data: projects } = trpc.projects.list.useQuery()

  // Create map for quick project lookup by id
  const projectsMap = useMemo(() => {
    if (!projects) return new Map()
    return new Map(projects.map((p) => [p.id, p]))
  }, [projects])

  // Fetch all archived chats (to get count)
  const { data: archivedChats } = trpc.chats.listArchived.useQuery({})
  const archivedChatsCount = archivedChats?.length ?? 0

  // Unified undo stack for workspaces and sub-chats (Jotai atom)
  const [undoStack, setUndoStack] = useAtom(undoStackAtom)

  // Restore chat mutation (for undo)
  const restoreChatMutation = trpc.chats.restore.useMutation({
    onSuccess: (_, variables) => {
      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()
      // Select the restored chat
      setSelectedChatId(variables.id)
    },
  })

  // Remove workspace item from stack by chatId
  const removeWorkspaceFromStack = useCallback((chatId: string) => {
    setUndoStack((prev) => {
      const index = prev.findIndex((item) => item.type === "workspace" && item.chatId === chatId)
      if (index !== -1) {
        clearTimeout(prev[index].timeoutId)
        return [...prev.slice(0, index), ...prev.slice(index + 1)]
      }
      return prev
    })
  }, [setUndoStack])

  // Archive chat mutation
  const archiveChatMutation = trpc.chats.archive.useMutation({
    onSuccess: (_, variables) => {
      // Hide tooltip if visible (element may be removed from DOM before mouseLeave fires)
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
        agentTooltipTimerRef.current = null
      }
      if (agentTooltipRef.current) {
        agentTooltipRef.current.style.display = "none"
      }

      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      // If archiving the currently selected chat, navigate based on auto-advance setting
      if (selectedChatId === variables.id) {
        const currentIndex = agentChats?.findIndex((c) => c.id === variables.id) ?? -1

        if (autoAdvanceTarget === "next") {
          // Find next workspace in list (after current index)
          const nextChat = agentChats?.find((c, i) => i > currentIndex && c.id !== variables.id)
          if (nextChat) {
            setSelectedChatId(nextChat.id)
          } else {
            // No next workspace, go to new workspace view
            setSelectedChatId(null)
          }
        } else if (autoAdvanceTarget === "previous") {
          // Go to previously selected workspace
          const isPreviousAvailable = previousChatId &&
            agentChats?.some((c) => c.id === previousChatId && c.id !== variables.id)
          if (isPreviousAvailable) {
            setSelectedChatId(previousChatId)
          } else {
            setSelectedChatId(null)
          }
        } else {
          // Close: go to new workspace view
          setSelectedChatId(null)
        }
      }

      // Clear after 10 seconds (Cmd+Z window)
      const timeoutId = setTimeout(() => {
        removeWorkspaceFromStack(variables.id)
      }, 10000)

      // Add to unified undo stack for Cmd+Z
      setUndoStack((prev) => [...prev, {
        type: "workspace",
        chatId: variables.id,
        timeoutId,
      }])
    },
  })

  // Cmd+Z to undo archive (supports multiple undos for workspaces AND sub-chats)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && undoStack.length > 0) {
        e.preventDefault()
        // Get the most recent item
        const lastItem = undoStack[undoStack.length - 1]
        if (!lastItem) return

        // Clear timeout and remove from stack
        clearTimeout(lastItem.timeoutId)
        setUndoStack((prev) => prev.slice(0, -1))

        if (lastItem.type === "workspace") {
          // Restore workspace from archive
          restoreChatMutation.mutate({ id: lastItem.chatId })
        } else if (lastItem.type === "subchat") {
          // Restore sub-chat tab (re-add to open tabs)
          const store = useAgentSubChatStore.getState()
          store.addToOpenSubChats(lastItem.subChatId)
          store.setActiveSubChat(lastItem.subChatId)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [undoStack, setUndoStack, restoreChatMutation, setSelectedChatId])

  // Batch archive mutation
  const archiveChatsBatchMutation = trpc.chats.archiveBatch.useMutation({
    onSuccess: (_, variables) => {
      // Hide tooltip if visible (element may be removed from DOM before mouseLeave fires)
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
        agentTooltipTimerRef.current = null
      }
      if (agentTooltipRef.current) {
        agentTooltipRef.current.style.display = "none"
      }

      utils.chats.list.invalidate()
      utils.chats.listArchived.invalidate()

      // Add each chat to unified undo stack for Cmd+Z
      const newItems: UndoItem[] = variables.chatIds.map((chatId) => {
        const timeoutId = setTimeout(() => {
          removeWorkspaceFromStack(chatId)
        }, 10000)
        return { type: "workspace" as const, chatId, timeoutId }
      })
      setUndoStack((prev) => [...prev, ...newItems])
    },
  })

  // Reset selected chat when project changes (but not on initial load)
  const prevProjectIdRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    // Skip on initial mount (prevProjectIdRef is undefined)
    if (prevProjectIdRef.current === undefined) {
      prevProjectIdRef.current = selectedProject?.id ?? null
      return
    }
    // Only reset if project actually changed from a real value (not from null/initial load)
    if (
      prevProjectIdRef.current !== null &&
      prevProjectIdRef.current !== selectedProject?.id &&
      selectedChatId
    ) {
      setSelectedChatId(null)
    }
    prevProjectIdRef.current = selectedProject?.id ?? null
  }, [selectedProject?.id]) // Don't include selectedChatId in deps to avoid loops

  // Load pinned IDs from localStorage when project changes
  useEffect(() => {
    if (!selectedProject?.id) {
      setPinnedChatIds(new Set())
      return
    }
    try {
      const stored = localStorage.getItem(
        `agent-pinned-chats-${selectedProject.id}`,
      )
      setPinnedChatIds(stored ? new Set(JSON.parse(stored)) : new Set())
    } catch {
      setPinnedChatIds(new Set())
    }
  }, [selectedProject?.id])

  // Save pinned IDs to localStorage when they change
  const prevPinnedRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!selectedProject?.id) return
    // Only save if pinnedChatIds actually changed (avoid saving on load)
    if (
      (pinnedChatIds !== prevPinnedRef.current && pinnedChatIds.size > 0) ||
      prevPinnedRef.current.size > 0
    ) {
      localStorage.setItem(
        `agent-pinned-chats-${selectedProject.id}`,
        JSON.stringify([...pinnedChatIds]),
      )
    }
    prevPinnedRef.current = pinnedChatIds
  }, [pinnedChatIds, selectedProject?.id])

  // Rename mutation
  const renameChatMutation = trpc.chats.rename.useMutation({
    onSuccess: () => {
      utils.chats.list.invalidate()
    },
    onError: () => {
      toast.error("Failed to rename agent")
    },
  })

  // Accent color mutation — updates workspace color with optimistic cache update
  // Navigate to project settings page with the given project pre-selected
  const handleNavigateToSettings = useCallback((projectId: string) => {
    // Find the project to populate the selectedProjectAtom so the settings tab opens with it selected
    const project = projects?.find((p) => p.id === projectId)
    if (project) {
      setSelectedProject({ id: project.id, name: project.name, path: project.path })
    }
    setSettingsActiveTab("projects")
    setSettingsDialogOpen(true)
  }, [projects, setSelectedProject, setSettingsActiveTab, setSettingsDialogOpen])

  const handleTogglePin = useCallback((chatId: string) => {
    setPinnedChatIds((prev) => {
      const next = new Set(prev)
      if (next.has(chatId)) {
        next.delete(chatId)
      } else {
        next.add(chatId)
      }
      return next
    })
  }, [])

  const handleRenameClick = useCallback((chat: { id: string; name: string | null }) => {
    setRenamingChat(chat as { id: string; name: string })
    setRenameDialogOpen(true)
  }, [])

  const handleRenameSave = async (newName: string) => {
    if (!renamingChat) return

    const chatId = renamingChat.id
    const oldName = renamingChat.name

    setRenameLoading(true)

    try {
      // Optimistically update the query cache
      utils.chats.list.setData({}, (old) => {
        if (!old) return old
        return old.map((c) => (c.id === chatId ? { ...c, name: newName } : c))
      })

      try {
        await renameChatMutation.mutateAsync({
          id: chatId,
          name: newName,
        })
      } catch {
        // Rollback on error
        utils.chats.list.setData({}, (old) => {
          if (!old) return old
          return old.map((c) => (c.id === chatId ? { ...c, name: oldName } : c))
        })
        throw new Error("Failed to rename workspace")
      }
      setRenameDialogOpen(false)
    } catch (error) {
      console.error('[handleRenameSave] Rename failed:', error)
      toast.error("Failed to rename workspace")
    } finally {
      setRenameLoading(false)
      setRenamingChat(null)
    }
  }

  // Check if all selected chats are pinned
  const areAllSelectedPinned = useMemo(() => {
    if (selectedChatIds.size === 0) return false
    return Array.from(selectedChatIds).every((id) => pinnedChatIds.has(id))
  }, [selectedChatIds, pinnedChatIds])

  // Check if all selected chats are unpinned
  const areAllSelectedUnpinned = useMemo(() => {
    if (selectedChatIds.size === 0) return false
    return Array.from(selectedChatIds).every((id) => !pinnedChatIds.has(id))
  }, [selectedChatIds, pinnedChatIds])

  // Show pin option only if all selected have same pin state
  const canShowPinOption = areAllSelectedPinned || areAllSelectedUnpinned

  // Handle bulk pin of selected chats
  const handleBulkPin = useCallback(() => {
    const chatIdsToPin = Array.from(selectedChatIds)
    if (chatIdsToPin.length > 0) {
      setPinnedChatIds((prev) => {
        const next = new Set(prev)
        chatIdsToPin.forEach((id) => next.add(id))
        return next
      })
      clearChatSelection()
    }
  }, [selectedChatIds, clearChatSelection])

  // Handle bulk unpin of selected chats
  const handleBulkUnpin = useCallback(() => {
    const chatIdsToUnpin = Array.from(selectedChatIds)
    if (chatIdsToUnpin.length > 0) {
      setPinnedChatIds((prev) => {
        const next = new Set(prev)
        chatIdsToUnpin.forEach((id) => next.delete(id))
        return next
      })
      clearChatSelection()
    }
  }, [selectedChatIds, clearChatSelection])

  // Filter and separate pinned/unpinned agents
  // During search: show ALL workspaces (they auto-expand and sub-chats are filtered within each)
  // This allows finding threads even when the parent workspace name doesn't match the query
  const { pinnedAgents, unpinnedAgents, filteredChats } = useMemo(() => {
    if (!agentChats)
      return { pinnedAgents: [], unpinnedAgents: [], filteredChats: [] }

    // Keep all workspaces visible during search — sub-chat filtering happens inside
    // WorkspaceSubChats, and workspace names are visually dimmed when they don't match
    let sorted = [...agentChats]

    // Apply sort mode: "alpha" sorts alphabetically, "recent" is already sorted by updatedAt
    if (sortMode === "alpha") {
      sorted.sort((a, b) => {
        const aName = (a.name ?? "").toLowerCase()
        const bName = (b.name ?? "").toLowerCase()
        return aName.localeCompare(bName)
      })
    }

    const pinned = sorted.filter((chat) => pinnedChatIds.has(chat.id))
    const unpinned = sorted.filter((chat) => !pinnedChatIds.has(chat.id))

    return {
      pinnedAgents: pinned,
      unpinnedAgents: unpinned,
      filteredChats: [...pinned, ...unpinned],
    }
  }, [searchQuery, agentChats, pinnedChatIds, sortMode])

  // Group chats by project for the sidebar hierarchy (owner/repo grouping)
  type ChatType = typeof filteredChats extends (infer T)[] ? T : never
  const projectGroupedChats = useMemo(() => {
    const groups: Array<{
      key: string
      label: string
      projectId: string | null
      chats: ChatType[]
    }> = []
    const groupMap = new Map<string, ChatType[]>()
    const groupOrder: string[] = []
    const projectIdsWithChats = new Set<string>()

    for (const chat of filteredChats) {
      const project = chat.projectId ? projectsMap.get(chat.projectId) : null
      if (chat.projectId) projectIdsWithChats.add(chat.projectId)
      const groupKey = project ? `proj:${chat.projectId}` : "ungrouped"

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, [])
        groupOrder.push(groupKey)
      }
      groupMap.get(groupKey)!.push(chat)
    }

    // Build groups from chats
    for (const key of groupOrder) {
      const chats = groupMap.get(key)!
      const firstChat = chats[0]
      const project = firstChat?.projectId ? projectsMap.get(firstChat.projectId) : null

      let label = key
      if (key === "ungrouped") {
        label = "Unlinked"
      } else if (project) {
        const owner = project.gitOwner
        const repo = project.gitRepo || project.name
        label = owner && repo ? `${owner}/${repo}` : repo || project.name || key
      }

      groups.push({
        key,
        label,
        projectId: firstChat?.projectId ?? null,
        chats,
      })
    }

    // Add projects that have no chats (show as empty groups)
    if (projects) {
      for (const project of projects) {
        if (!projectIdsWithChats.has(project.id)) {
          const owner = project.gitOwner
          const repo = project.gitRepo || project.name
          const label = owner && repo ? `${owner}/${repo}` : repo || project.name || "Project"
          groups.push({
            key: `proj:${project.id}`,
            label,
            projectId: project.id,
            chats: [],
          })
        }
      }
    }

    return groups
  }, [filteredChats, projectsMap, projects])

  // Handle bulk archive of selected chats
  const handleBulkArchive = useCallback(() => {
    const chatIdsToArchive = Array.from(selectedChatIds)
    if (chatIdsToArchive.length === 0) return

    // If active chat is being archived, navigate to previous or new workspace
    const isArchivingActiveChat =
      selectedChatId && chatIdsToArchive.includes(selectedChatId)

    archiveChatsBatchMutation.mutate({ chatIds: chatIdsToArchive }, {
      onSuccess: () => {
        if (isArchivingActiveChat) {
          // Check if previous chat is available (exists and not being archived)
          const remainingChats = filteredChats.filter(
            (c) => !chatIdsToArchive.includes(c.id)
          )
          const isPreviousAvailable = previousChatId &&
            remainingChats.some((c) => c.id === previousChatId)

          if (isPreviousAvailable) {
            setSelectedChatId(previousChatId)
          } else {
            setSelectedChatId(null)
          }
        }
        clearChatSelection()
      },
    })
  }, [
    selectedChatIds,
    selectedChatId,
    previousChatId,
    filteredChats,
    archiveChatsBatchMutation,
    setSelectedChatId,
    clearChatSelection,
  ])

  const handleArchiveAllBelow = useCallback(
    (chatId: string) => {
      const currentIndex = filteredChats.findIndex((c) => c.id === chatId)
      if (currentIndex === -1 || currentIndex === filteredChats.length - 1)
        return

      const chatsBelow = filteredChats.slice(currentIndex + 1)
      const chatIds = chatsBelow.map((c) => c.id)

      if (chatIds.length > 0) {
        archiveChatsBatchMutation.mutate({ chatIds })
      }
    },
    [filteredChats, archiveChatsBatchMutation],
  )

  const handleArchiveOthers = useCallback(
    (chatId: string) => {
      const otherChats = filteredChats.filter((c) => c.id !== chatId)
      const chatIds = otherChats.map((c) => c.id)

      if (chatIds.length > 0) {
        archiveChatsBatchMutation.mutate({ chatIds })
      }
    },
    [filteredChats, archiveChatsBatchMutation],
  )

  // Delete a draft from localStorage
  const handleDeleteDraft = useCallback(
    (draftId: string) => {
      deleteNewChatDraft(draftId)
      // If the deleted draft was selected, clear selection
      if (selectedDraftId === draftId) {
        setSelectedDraftId(null)
      }
    },
    [selectedDraftId, setSelectedDraftId],
  )

  // Select a draft for editing
  const handleDraftSelect = useCallback(
    (draftId: string) => {
      // Navigate to NewChatForm with this draft selected
      setSelectedChatId(null)
      setSelectedDraftId(draftId)
      setShowNewChatForm(false) // Clear explicit new chat state when selecting a draft
    },
    [setSelectedChatId, setSelectedDraftId, setShowNewChatForm],
  )

  // Reset focused index when search query changes
  useEffect(() => {
    setFocusedChatIndex(-1)
  }, [searchQuery, filteredChats.length])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedChatIndex >= 0 && filteredChats.length > 0) {
      const focusedElement = scrollContainerRef.current?.querySelector(
        `[data-chat-index="${focusedChatIndex}"]`,
      ) as HTMLElement
      if (focusedElement) {
        focusedElement.scrollIntoView({
          block: "nearest",
          behavior: "smooth",
        })
      }
    }
  }, [focusedChatIndex, filteredChats.length])

  // Derive which chats have loading sub-chats
  const loadingChatIds = useMemo(
    () => new Set([...loadingSubChats.values()]),
    [loadingSubChats],
  )

  // Convert file stats to a Map for easy lookup
  const workspaceFileStats = useMemo(() => {
    const statsMap = new Map<string, { fileCount: number; additions: number; deletions: number }>()

    // Use stats from DB query
    if (fileStatsData) {
      for (const stat of fileStatsData) {
        statsMap.set(stat.chatId, {
          fileCount: stat.fileCount,
          additions: stat.additions,
          deletions: stat.deletions,
        })
      }
    }

    return statsMap
  }, [fileStatsData])

  // Aggregate pending plan approvals by workspace (chatId) from DB
  const workspacePendingPlans = useMemo(() => {
    const chatIdsWithPendingPlans = new Set<string>()
    if (pendingPlanApprovalsData) {
      for (const { chatId } of pendingPlanApprovalsData) {
        chatIdsWithPendingPlans.add(chatId)
      }
    }
    return chatIdsWithPendingPlans
  }, [pendingPlanApprovalsData])

  // Get workspace IDs that have pending user questions
  const workspacePendingQuestions = useMemo(() => {
    const chatIds = new Set<string>()
    for (const question of pendingQuestions.values()) {
      chatIds.add(question.parentChatId)
    }
    return chatIds
  }, [pendingQuestions])

  const handleNewAgent = () => {
    triggerHaptic("light")
    setSelectedChatId(null)
    setSelectedDraftId(null) // Clear selected draft so form starts empty
    setShowNewChatForm(true) // Explicitly show new chat form
    setDesktopView(null) // Clear automations/inbox view
  }

  const handleChatClick = useCallback(async (
    chatId: string,
    e?: React.MouseEvent,
    globalIndex?: number,
  ) => {
    // Shift+click for range selection (works in both normal and multi-select mode)
    if (e?.shiftKey) {
      e.preventDefault()

      const clickedIndex =
        globalIndex ?? filteredChats.findIndex((c) => c.id === chatId)

      if (clickedIndex === -1) return

      // Find the anchor: use active chat or last selected item
      let anchorIndex = -1

      // First try: use currently active/selected chat as anchor
      if (selectedChatId) {
        anchorIndex = filteredChats.findIndex((c) => c.id === selectedChatId)
      }

      // If no active chat, try to use the last item in selection
      if (anchorIndex === -1 && selectedChatIds.size > 0) {
        // Find the first selected item in the list as anchor
        for (let i = 0; i < filteredChats.length; i++) {
          if (selectedChatIds.has(filteredChats[i]!.id)) {
            anchorIndex = i
            break
          }
        }
      }

      // If still no anchor, just select the clicked item
      if (anchorIndex === -1) {
        if (!selectedChatIds.has(chatId)) {
          toggleChatSelection(chatId)
        }
        return
      }

      // Select range from anchor to clicked item
      const startIndex = Math.min(anchorIndex, clickedIndex)
      const endIndex = Math.max(anchorIndex, clickedIndex)

      // Build new selection set with the range
      const newSelection = new Set(selectedChatIds)
      for (let i = startIndex; i <= endIndex; i++) {
        const chat = filteredChats[i]
        if (chat) {
          newSelection.add(chat.id)
        }
      }
      setSelectedChatIds(newSelection)
      return
    }

    // In multi-select mode, clicking on the item still navigates to the chat
    // Only clicking on the checkbox toggles selection

    // Prevent opening same chat in multiple windows.
    // Claim new chat BEFORE releasing old one — if claim fails, we keep the current chat.
    if (window.desktopApi?.claimChat) {
      const result = await window.desktopApi.claimChat(chatId)
      if (!result.ok) {
        toast.info("This workspace is already open in another window", {
          description: "Switching to the existing window.",
          duration: 3000,
        })
        await window.desktopApi.focusChatOwner(chatId)
        return
      }
      // Release old chat only after new one is successfully claimed
      if (selectedChatId && selectedChatId !== chatId) {
        await window.desktopApi.releaseChat(selectedChatId)
      }
    }

    setSelectedChatId(chatId)
    setShowNewChatForm(false) // Clear new chat form state when selecting a workspace
    setDesktopView(null) // Clear automations/inbox view when selecting a chat

    // Toggle expand/collapse when re-clicking an already-selected workspace
    if (selectedChatId === chatId) {
      handleToggleExpand(chatId)
    }
  }, [filteredChats, selectedChatId, selectedChatIds, toggleChatSelection, setSelectedChatIds, setSelectedChatId, setShowNewChatForm, setDesktopView, handleToggleExpand])

  const handleCheckboxClick = useCallback((e: React.MouseEvent, chatId: string) => {
    e.stopPropagation()
    toggleChatSelection(chatId)
  }, [toggleChatSelection])

  const formatTime = useCallback((dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60_000)
    const diffHours = Math.floor(diffMs / 3_600_000)
    const diffDays = Math.floor(diffMs / 86_400_000)

    if (diffMins < 1) return "now"
    if (diffMins < 60) return `${diffMins}m`
    if (diffHours < 24) return `${diffHours}h`
    if (diffDays < 7) return `${diffDays}d`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`
    return `${Math.floor(diffDays / 365)}y`
  }, [])

  // Archive single chat - wrapped for memoized component
  // Checks for active terminal processes and worktree, shows confirmation dialog if needed
  const handleArchiveSingle = useCallback(async (chatId: string) => {
    const chat = agentChats?.find((c) => c.id === chatId)

    // Fetch both session count and worktree status in parallel
    const isLocalMode = !chat?.branch
    const [sessionCount, worktreeStatus] = await Promise.all([
      // Local mode: terminals are shared and won't be killed on archive, so skip count
      isLocalMode
        ? Promise.resolve(0)
        : utils.terminal.getActiveSessionCount.fetch({ workspaceId: chatId }),
      utils.chats.getWorktreeStatus.fetch({ chatId }),
    ])

    const needsConfirmation = sessionCount > 0 || worktreeStatus.hasWorktree

    if (needsConfirmation) {
      // Show confirmation dialog
      setArchivingChatId(chatId)
      setActiveProcessCount(sessionCount)
      setHasWorktree(worktreeStatus.hasWorktree)
      setUncommittedCount(worktreeStatus.uncommittedCount)
      setConfirmArchiveDialogOpen(true)
    } else {
      // No active processes and no worktree, archive directly
      archiveChatMutation.mutate({ id: chatId })
    }
  }, [
    agentChats,
    archiveChatMutation,
    utils.terminal.getActiveSessionCount,
    utils.chats.getWorktreeStatus,
  ])

  // Confirm archive after user accepts dialog (optimistic - closes immediately)
  const handleConfirmArchive = useCallback((deleteWorktree: boolean) => {
    if (archivingChatId) {
      archiveChatMutation.mutate({ id: archivingChatId, deleteWorktree })
      setArchivingChatId(null)
    }
  }, [archiveChatMutation, archivingChatId])

  // Close archive confirmation dialog
  const handleCloseArchiveDialog = useCallback(() => {
    setConfirmArchiveDialogOpen(false)
    setArchivingChatId(null)
  }, [])

  // Copy branch name to clipboard
  const handleCopyBranch = useCallback((branch: string) => {
    navigator.clipboard.writeText(branch)
    toast.success("Branch name copied", { description: branch })
  }, [])

  // Ref callback for name elements
  const nameRefCallback = useCallback((chatId: string, el: HTMLSpanElement | null) => {
    if (el) {
      nameRefs.current.set(chatId, el)
    }
  }, [])

  // Handle agent card hover for truncated name tooltip (1s delay)
  // Uses DOM manipulation instead of state to avoid re-renders
  const handleAgentMouseEnter = useCallback(
    (chatId: string, name: string | null, cardElement: HTMLElement, globalIndex: number) => {
      // Update hovered index ref
      hoveredChatIndexRef.current = globalIndex

      // Clear any existing timer
      if (agentTooltipTimerRef.current) {
        clearTimeout(agentTooltipTimerRef.current)
      }

      const nameEl = nameRefs.current.get(chatId)
      if (!nameEl) return

      // Check if name is truncated
      const isTruncated = nameEl.scrollWidth > nameEl.clientWidth
      if (!isTruncated) return

      // Show tooltip after 1 second delay via DOM manipulation (no state update)
      agentTooltipTimerRef.current = setTimeout(() => {
        const tooltip = agentTooltipRef.current
        if (!tooltip) return

        const rect = cardElement.getBoundingClientRect()
        tooltip.style.display = "block"
        tooltip.style.top = `${rect.top + rect.height / 2}px`
        tooltip.style.left = `${rect.right + 8}px`
        tooltip.textContent = name || ""
      }, 1000)
    },
    [],
  )

  const handleAgentMouseLeave = useCallback(() => {
    // Reset hovered index
    hoveredChatIndexRef.current = -1
    // Clear timer if hovering ends before delay
    if (agentTooltipTimerRef.current) {
      clearTimeout(agentTooltipTimerRef.current)
      agentTooltipTimerRef.current = null
    }
    // Hide tooltip via DOM manipulation (no state update)
    const tooltip = agentTooltipRef.current
    if (tooltip) {
      tooltip.style.display = "none"
    }
  }, [])

  // Update sidebar hover UI - DOM manipulation for close button, state for TrafficLights
  // TrafficLights component handles native traffic light visibility via its own effect
  // Update sidebar hover UI via DOM manipulation (no state update to avoid re-renders)
  const updateSidebarHoverUI = useCallback((hovered: boolean) => {
    isSidebarHoveredRef.current = hovered
    // Update close button opacity
    if (closeButtonRef.current) {
      closeButtonRef.current.style.opacity = hovered ? "1" : "0"
    }
  }, [])

  const handleSidebarMouseEnter = useCallback(() => {
    updateSidebarHoverUI(true)
  }, [updateSidebarHoverUI])

  const handleSidebarMouseLeave = useCallback((e: React.MouseEvent) => {
    // Electron's drag region (WebkitAppRegion: "drag") returns a non-HTMLElement
    // object as relatedTarget. We preserve hover state in this case so the
    // traffic lights remain visible when hovering over the drag area.
    const relatedTarget = e.relatedTarget
    if (!relatedTarget || !(relatedTarget instanceof HTMLElement)) return
    const isStillInSidebar = relatedTarget.closest("[data-sidebar-content]")
    if (!isStillInSidebar) {
      updateSidebarHoverUI(false)
    }
  }, [updateSidebarHoverUI])

  // Check if scroll is needed and show/hide gradients via DOM manipulation
  React.useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const checkScroll = () => {
      const needsScroll = container.scrollHeight > container.clientHeight
      if (needsScroll) {
        if (bottomGradientRef.current) bottomGradientRef.current.style.opacity = "1"
        if (topGradientRef.current) topGradientRef.current.style.opacity = "0"
      } else {
        if (bottomGradientRef.current) bottomGradientRef.current.style.opacity = "0"
        if (topGradientRef.current) topGradientRef.current.style.opacity = "0"
      }
    }

    checkScroll()
    // Re-check when content might change
    const resizeObserver = new ResizeObserver(checkScroll)
    resizeObserver.observe(container)

    return () => resizeObserver.disconnect()
  }, [filteredChats])

  // Direct listener for Cmd+K to focus search input
  useEffect(() => {
    const handleSearchHotkey = (e: KeyboardEvent) => {
      // Check for Cmd+K or Ctrl+K (only for search functionality)
      if (
        (e.metaKey || e.ctrlKey) &&
        e.code === "KeyK" &&
        !e.shiftKey &&
        !e.altKey
      ) {
        e.preventDefault()
        e.stopPropagation()

        // Focus search input
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener("keydown", handleSearchHotkey, true)

    return () => {
      window.removeEventListener("keydown", handleSearchHotkey, true)
    }
  }, [])

  // Multi-select hotkeys
  // X to toggle selection of hovered or focused chat
  useHotkeys(
    "x",
    () => {
      if (!filteredChats || filteredChats.length === 0) return

      // Prefer hovered, then focused - do NOT fallback to 0 (would conflict with sub-chat sidebar)
      const targetIndex =
        hoveredChatIndexRef.current >= 0
          ? hoveredChatIndexRef.current
          : focusedChatIndex >= 0
            ? focusedChatIndex
            : -1

      if (targetIndex >= 0 && targetIndex < filteredChats.length) {
        const chatId = filteredChats[targetIndex]!.id
        // Toggle selection (both select and deselect)
        toggleChatSelection(chatId)
      }
    },
    [filteredChats, focusedChatIndex, toggleChatSelection],
  )

  // Cmd+A / Ctrl+A to select all chats (only when at least one is already selected)
  useHotkeys(
    "mod+a",
    (e) => {
      if (isMultiSelectMode && filteredChats && filteredChats.length > 0) {
        e.preventDefault()
        selectAllChats(filteredChats.map((c) => c.id))
      }
    },
    [filteredChats, selectAllChats, isMultiSelectMode],
  )

  // Escape to clear selection
  useHotkeys(
    "escape",
    () => {
      if (isMultiSelectMode) {
        clearChatSelection()
        setFocusedChatIndex(-1)
      }
    },
    [isMultiSelectMode, clearChatSelection],
  )

  // Cmd+E to archive current workspace (desktop) or Opt+Cmd+E (web)
  useEffect(() => {
    const handleArchiveHotkey = (e: KeyboardEvent) => {
      const isDesktop = isDesktopApp()

      // Desktop: Cmd+E (without Alt)
      const isDesktopShortcut =
        isDesktop &&
        e.metaKey &&
        e.code === "KeyE" &&
        !e.altKey &&
        !e.shiftKey &&
        !e.ctrlKey
      // Web: Opt+Cmd+E (with Alt)
      const isWebShortcut = e.altKey && e.metaKey && e.code === "KeyE"

      if (isDesktopShortcut || isWebShortcut) {
        e.preventDefault()

        // If multi-select mode, bulk archive selected chats
        if (isMultiSelectMode && selectedChatIds.size > 0) {
          if (!archiveChatsBatchMutation.isPending) {
            handleBulkArchive()
          }
          return
        }

        // Otherwise archive current chat (with confirmation if has active processes)
        if (selectedChatId && !archiveChatMutation.isPending) {
          handleArchiveSingle(selectedChatId)
        }
      }
    }

    window.addEventListener("keydown", handleArchiveHotkey)
    return () => window.removeEventListener("keydown", handleArchiveHotkey)
  }, [
    selectedChatId,
    archiveChatMutation,
    isMultiSelectMode,
    selectedChatIds,
    archiveChatsBatchMutation,
    handleBulkArchive,
    handleArchiveSingle,
  ])

  // Clear selection when project changes
  useEffect(() => {
    clearChatSelection()
  }, [selectedProject?.id, clearChatSelection])

  // Handle scroll for gradients - use DOM manipulation to avoid re-renders
  const handleAgentsScroll = React.useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget
      const needsScroll = scrollHeight > clientHeight

      if (!needsScroll) {
        if (topGradientRef.current) topGradientRef.current.style.opacity = "0"
        if (bottomGradientRef.current) bottomGradientRef.current.style.opacity = "0"
        return
      }

      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 5
      const isAtTop = scrollTop <= 5

      // Update gradient visibility via DOM (no setState = no re-render)
      if (topGradientRef.current) {
        topGradientRef.current.style.opacity = isAtTop ? "0" : "1"
      }
      if (bottomGradientRef.current) {
        bottomGradientRef.current.style.opacity = isAtBottom ? "0" : "1"
      }
    },
    [],
  )

  const sidebarContent = (
    <div
      className={cn(
        "group/sidebar flex flex-col gap-0 overflow-hidden select-none h-full bg-tl-background",
      )}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
      data-sidebar-content
    >
      {/* Header area */}
      <SidebarHeader
        isDesktop={isDesktop}
        isFullscreen={isFullscreen}
        desktopUser={desktopUser}
        onSignOut={onSignOut}
        onToggleSidebar={onToggleSidebar}
        setSettingsDialogOpen={setSettingsDialogOpen}
        setSettingsActiveTab={setSettingsActiveTab}
        handleSidebarMouseEnter={handleSidebarMouseEnter}
        handleSidebarMouseLeave={handleSidebarMouseLeave}
        closeButtonRef={closeButtonRef}
        onSearchClick={() => searchInputRef.current?.focus()}
      />

      {/* Hidden search input for keyboard-triggered search */}
      <Input
        ref={searchInputRef}
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault()
            setSearchQuery("")
            searchInputRef.current?.blur()
            setFocusedChatIndex(-1)
            return
          }
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setFocusedChatIndex((prev) => prev === -1 ? 0 : Math.min(prev + 1, filteredChats.length - 1))
            return
          }
          if (e.key === "ArrowUp") {
            e.preventDefault()
            setFocusedChatIndex((prev) => prev === -1 ? filteredChats.length - 1 : Math.max(prev - 1, 0))
            return
          }
          if (e.key === "Enter") {
            e.preventDefault()
            if (focusedChatIndex >= 0) {
              const focusedChat = filteredChats[focusedChatIndex]
              if (focusedChat) {
                handleChatClick(focusedChat.id)
                searchInputRef.current?.blur()
                setSearchQuery("")
                setFocusedChatIndex(-1)
              }
            }
            return
          }
        }}
        onBlur={() => {
          if (!searchQuery) setFocusedChatIndex(-1)
        }}
        className={cn(
          "rounded-md text-[12.5px] bg-transparent border border-border/30 placeholder:text-muted-foreground/25 focus:bg-foreground/[0.03] focus:border-border/60 focus-visible:ring-0 focus-visible:ring-offset-0 px-2.5 transition-all duration-150 mx-3 mb-1",
          searchQuery ? "h-7 opacity-100" : "h-0 opacity-0 overflow-hidden border-0 p-0 m-0",
        )}
      />

      {/* Navigation — New Agent + Marketplace */}
      <div className="px-3 pb-1 flex-shrink-0 space-y-0.5">
        <button
          type="button"
          onClick={handleNewAgent}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] transition-[background-color,color,transform] duration-150 ease-out",
            "bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.08] active:scale-[0.98]",
          )}
        >
          <IconFilter size={16} stroke={1.5} className="flex-shrink-0" />
          <span className="font-medium flex-1 text-left">New Agent</span>
          <Kbd className="text-[10px] opacity-40">{getShortcutKey("newAgent")}</Kbd>
        </button>

        <button
          type="button"
          onClick={() => {
            setSettingsActiveTab("preferences")
            setSettingsDialogOpen(true)
          }}
          className={cn(
            "flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] transition-[background-color,color,transform] duration-150 ease-out",
            "text-muted-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground active:scale-[0.98]",
          )}
        >
          <IconLayoutGrid size={16} stroke={1.5} className="flex-shrink-0" />
          <span className="font-medium">Marketplace</span>
        </button>
      </div>

      {/* Project-grouped agents list */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleAgentsScroll}
          className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/10 hover:scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent px-3"
        >
          {projectGroupedChats.map((group) => {
            const isGroupCollapsed = collapsedGroups.has(group.key)

            return (
              <div key={group.key}>
                {/* Project header */}
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      className="group/project-header flex items-center mt-4 first:mt-1 cursor-pointer"
                      onClick={() => setCollapsedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(group.key)) next.delete(group.key)
                        else next.add(group.key)
                        return next
                      })}
                    >
                      <span className="text-[12px] text-muted-foreground/35 font-normal truncate flex-1 py-1">
                        {group.label}
                      </span>
                      {group.projectId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedProject(projects?.find(p => p.id === group.projectId) as any ?? null)
                            handleNewAgent()
                          }}
                          className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/25 hover:text-muted-foreground/60 opacity-0 group-hover/project-header:opacity-100 transition-opacity duration-150"
                          aria-label="New agent"
                        >
                          <IconPlus size={12} stroke={2} />
                        </button>
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => {
                      setCollapsedGroups(prev => {
                        const next = new Set(prev)
                        if (next.has(group.key)) next.delete(group.key)
                        else next.add(group.key)
                        return next
                      })
                    }}>
                      {isGroupCollapsed ? "Expand" : "Collapse"}
                    </ContextMenuItem>
                    {group.projectId && (
                      <>
                        <ContextMenuItem onClick={() => handleNavigateToSettings(group.projectId!)}>
                          Project settings
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => {
                          setSelectedProject(projects?.find(p => p.id === group.projectId) as any ?? null)
                          handleNewAgent()
                        }}>
                          New agent
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>

                {/* Agents list */}
                <AnimatePresence initial={false}>
                  {!isGroupCollapsed && (
                    <motion.div
                      key={`group-${group.key}`}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{
                        height: TRANSITION_EXPAND,
                        opacity: { duration: 0.1, ease: EASE_OUT },
                      }}
                      className="overflow-hidden"
                    >
                      {group.chats.length > 0 && group.chats.map((chat) => {
                        const isSelected = selectedChatId === chat.id
                        const isLoading = loadingChatIds.has(chat.id)
                        const hasPendingQuestion = workspacePendingQuestions.has(chat.id)
                        const hasPendingPlan = workspacePendingPlans.has(chat.id)
                        const isActive = isLoading || hasPendingQuestion || hasPendingPlan

                        return (
                          <ContextMenu key={chat.id}>
                            <ContextMenuTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => handleChatClick(chat.id, e)}
                                onMouseEnter={(e) => handleAgentMouseEnter(chat.id, chat.name, e.currentTarget, filteredChats.findIndex(c => c.id === chat.id))}
                                onMouseLeave={handleAgentMouseLeave}
                                className={cn(
                                  "group/agent flex items-center gap-3 w-full pl-3 pr-3 py-2 rounded-lg text-[14px] text-left transition-[background-color,color] duration-100 ease-out",
                                  isSelected
                                    ? "bg-foreground/[0.06] text-foreground"
                                    : "text-muted-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                                )}
                              >
                                {/* Status dot */}
                                <AnimatePresence mode="wait" initial={false}>
                                  {isActive ? (
                                    <motion.span
                                      key="active"
                                      initial={{ opacity: 0, scale: 0.85 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.85 }}
                                      transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
                                      className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px] text-muted-foreground"
                                    >
                                      <GridPulseSpinner size={12} />
                                    </motion.span>
                                  ) : (
                                    <motion.span
                                      key="idle"
                                      initial={{ opacity: 0, scale: 0.85 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.85 }}
                                      transition={{ duration: DURATION_INSTANT, ease: EASE_OUT }}
                                      className="flex-shrink-0 flex items-center justify-center w-[18px] h-[18px]"
                                    >
                                      <span className={cn(
                                        "w-[6px] h-[6px] rounded-full",
                                        isSelected ? "bg-muted-foreground/50" : "bg-muted-foreground/25",
                                      )} />
                                    </motion.span>
                                  )}
                                </AnimatePresence>
                                <span className="truncate flex-1">{chat.name || "Untitled"}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleArchiveSingle(chat.id)
                                  }}
                                  className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded text-muted-foreground/25 hover:text-muted-foreground/60 opacity-0 group-hover/agent:opacity-100 transition-opacity duration-150"
                                  aria-label="Archive"
                                >
                                  <IconArchive size={12} stroke={1.5} />
                                </button>
                              </button>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem onClick={() => handleRenameClick({ id: chat.id, name: chat.name })}>
                                Rename
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleArchiveSingle(chat.id)}>
                                Archive
                              </ContextMenuItem>
                              {chat.branch && (
                                <>
                                  <ContextMenuSeparator />
                                  <ContextMenuItem onClick={() => handleCopyBranch(chat.branch!)}>
                                    Copy branch name
                                  </ContextMenuItem>
                                </>
                              )}
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => handleArchiveOthers(chat.id)}>
                                Archive others
                              </ContextMenuItem>
                            </ContextMenuContent>
                          </ContextMenu>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}

          {/* Empty state when no projects have chats */}
          {projectGroupedChats.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground/30 text-[13px]">
              No workspaces yet
            </div>
          )}
        </div>

        {/* Top gradient */}
        <div
          ref={topGradientRef}
          className="absolute top-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-b from-tl-background via-tl-background/50 to-transparent transition-opacity duration-150 opacity-0"
        />
        {/* Bottom gradient */}
        <div
          ref={bottomGradientRef}
          className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-tl-background via-tl-background/50 to-transparent transition-opacity duration-150 opacity-0"
        />
      </div>

      {/* Footer — Open Workspace */}
      <div className="px-3 py-2.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => {
            setSettingsActiveTab("projects")
            setSettingsDialogOpen(true)
          }}
          className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg text-[13px] text-muted-foreground/35 hover:text-foreground hover:bg-foreground/[0.04] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]"
        >
          <IconLogin size={16} stroke={1.5} className="flex-shrink-0" />
          <span className="font-medium">Open Workspace</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {sidebarContent}

      {/* Agent name tooltip portal - always rendered, visibility controlled via ref/DOM */}
      {typeof document !== "undefined" &&
        createPortal(
          <div
            ref={agentTooltipRef}
            className="fixed z-[100000] max-w-xs px-2 py-1 text-xs bg-popover border border-border rounded-md shadow-lg dark pointer-events-none text-foreground/90 whitespace-nowrap"
            style={{
              display: "none",
              transform: "translateY(-50%)",
            }}
          />,
          document.body,
        )}

      {/* Rename Dialog */}
      <AgentsRenameSubChatDialog
        isOpen={renameDialogOpen}
        onClose={() => {
          setRenameDialogOpen(false)
          setRenamingChat(null)
        }}
        onSave={handleRenameSave}
        currentName={renamingChat?.name || ""}
        isLoading={renameLoading}
      />

      {/* Confirm Archive Dialog */}
      <ConfirmArchiveDialog
        isOpen={confirmArchiveDialogOpen}
        onClose={handleCloseArchiveDialog}
        onConfirm={handleConfirmArchive}
        activeProcessCount={activeProcessCount}
        hasWorktree={hasWorktree}
        uncommittedCount={uncommittedCount}
      />

    </>
  )
}
