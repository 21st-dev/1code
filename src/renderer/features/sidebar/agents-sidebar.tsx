"use client"

import React from "react"
import { useState, useRef, useMemo, useEffect, useCallback, memo, forwardRef } from "react"
import { createPortal } from "react-dom"
import { motion, AnimatePresence } from "motion/react"
import { Button as ButtonCustom } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { useSetAtom, useAtom, useAtomValue } from "jotai"
import {
  autoAdvanceTargetAtom,
  createTeamDialogOpenAtom,
  agentsSettingsDialogActiveTabAtom,
  agentsSettingsDialogOpenAtom,
  agentsHelpPopoverOpenAtom,
  selectedAgentChatIdsAtom,
  isAgentMultiSelectModeAtom,
  toggleAgentChatSelectionAtom,
  selectAllAgentChatsAtom,
  clearAgentChatSelectionAtom,
  selectedAgentChatsCountAtom,
  isDesktopAtom,
  isFullscreenAtom,
  showOfflineModeFeaturesAtom,
  showWorkspaceIconAtom,
} from "../../lib/atoms"
import { ArchivePopover } from "../agents/ui/archive-popover"
import { ChevronDown, MoreHorizontal } from "lucide-react"
// import { useRouter } from "next/navigation" // Desktop doesn't use next/navigation
// import { useCombinedAuth } from "@/lib/hooks/use-combined-auth"
const useCombinedAuth = () => ({ userId: null })
// import { AuthDialog } from "@/components/auth/auth-dialog"
const AuthDialog = () => null
// Desktop: archive is handled inline, not via hook
// import { DiscordIcon } from "@/components/icons"
import { DiscordIcon } from "../../icons"
import { AgentsRenameSubChatDialog } from "../agents/components/agents-rename-subchat-dialog"
import { ConfirmArchiveDialog } from "../../components/confirm-archive-dialog"
import { trpc } from "../../lib/trpc"
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
  PlusIcon,
  ProfileIcon,
  PublisherStudioIcon,
  SearchIcon,
  GitHubLogo,
  LoadingDot,
  ArchiveIcon,
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
  loadingSubChatsAtom,
  agentsUnseenChangesAtom,
  archivePopoverOpenAtom,
  agentsDebugModeAtom,
  selectedProjectAtom,
  justCreatedIdsAtom,
  undoStackAtom,
  pendingUserQuestionsAtom,
  type UndoItem,
} from "../agents/atoms"
import { NetworkStatus } from "../../components/ui/network-status"
import { useAgentSubChatStore, OPEN_SUB_CHATS_CHANGE_EVENT } from "../agents/stores/sub-chat-store"
import { AgentsHelpPopover } from "../agents/components/agents-help-popover"
import { getShortcutKey, isDesktopApp } from "../../lib/utils/platform"
import { pluralize } from "../agents/utils/pluralize"
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

  if (hasError) {
    return <GitHubLogo className={cn(className, "text-muted-foreground flex-shrink-0")} />
  }

  return (
    <div className={cn(className, "relative flex-shrink-0")}>
      {/* Placeholder background while loading */}
      {!isLoaded && (
        <div className="absolute inset-0 rounded-sm bg-muted" />
      )}
      <img
        src={`https://github.com/${gitOwner}.png?size=64`}
        alt={gitOwner}
        className={cn(className, "rounded-sm flex-shrink-0", isLoaded ? 'opacity-100' : 'opacity-0')}
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
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ duration: 0.15 }}
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
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <QuestionIcon className="w-2.5 h-2.5 text-blue-500" />
                </motion.div>
              ) : isLoading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-muted-foreground" />
                </motion.div>
              ) : hasPendingPlan ? (
                <motion.div
                  key="plan"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                  className="w-1.5 h-1.5 rounded-full bg-amber-500"
                />
              ) : (
                <motion.div
                  key="unseen"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
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
  isMobileFullscreen,
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
  isMobileFullscreen: boolean
  showIcon: boolean
  onSelect: (draftId: string) => void
  onDelete: (draftId: string) => void
  formatTime: (dateStr: string) => string
}) {
  return (
    <div
      onClick={() => onSelect(draftId)}
      className={cn(
        "w-full text-left py-1.5 cursor-pointer group relative",
        "transition-colors duration-75",
        "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
        isMultiSelectMode ? "px-3" : "pl-2 pr-2",
        !isMultiSelectMode && "rounded-md",
        isSelected
          ? "bg-foreground/5 text-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      <div className="flex items-start gap-2.5">
        {showIcon && (
          <div className="pt-0.5">
            <div className="relative flex-shrink-0 w-4 h-4">
              {projectGitOwner && projectGitProvider === "github" ? (
                <GitHubAvatar gitOwner={projectGitOwner} />
              ) : (
                <GitHubLogo className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="truncate block text-sm leading-tight flex-1">
              {draftText.slice(0, 50)}
              {draftText.length > 50 ? "..." : ""}
            </span>
            {/* Delete button - shown on hover */}
            {!isMultiSelectMode && !isMobileFullscreen && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(draftId)
                }}
                tabIndex={-1}
                className="flex-shrink-0 text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                aria-label="Delete draft"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground/60 truncate">
              <span className="text-blue-500">Draft</span>
              {projectGitRepo
                ? ` • ${projectGitRepo}`
                : projectName
                  ? ` • ${projectName}`
                  : ""}
            </span>
            <span className="text-[11px] text-muted-foreground/60 flex-shrink-0">
              {formatTime(new Date(draftUpdatedAt).toISOString())}
            </span>
          </div>
        </div>
      </div>
    </div>
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
  isMobileFullscreen,
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
  isMobileFullscreen: boolean
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
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-chat-item
          data-chat-index={globalIndex}
          onClick={(e) => {
            // On real mobile (touch devices), onTouchEnd handles the click
            // In desktop app with narrow window, we still use mouse clicks
            if (isMobileFullscreen && !isDesktop) return
            onChatClick(chatId, e, globalIndex)
          }}
          onTouchEnd={(e) => {
            // On real mobile touch devices, use touchEnd directly to bypass ContextMenu's click delay
            if (isMobileFullscreen && !isDesktop) {
              e.preventDefault()
              onChatClick(chatId, undefined, globalIndex)
            }
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
          className={cn(
            "w-full text-left py-1.5 cursor-pointer group relative",
            "transition-colors duration-75",
            "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            // In multi-select: px-3 compensates for removed container px-2, keeping text aligned
            isMultiSelectMode ? "px-3" : "pl-2 pr-2",
            !isMultiSelectMode && "rounded-md",
            isSelected
              ? "bg-foreground/5 text-foreground"
              : isFocused
                ? "bg-foreground/5 text-foreground"
                : // On mobile, no hover effect to prevent double-tap issue
                  isMobileFullscreen
                  ? "text-muted-foreground"
                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
            isChecked &&
              (isMobileFullscreen
                ? "bg-primary/10"
                : "bg-primary/10 hover:bg-primary/15"),
          )}
        >
          <div className="flex items-start gap-2.5">
            {/* Icon container - only render if showIcon or in multi-select mode */}
            {(showIcon || isMultiSelectMode) && (
              <div className="pt-0.5">
                <ChatIcon
                  isSelected={isSelected}
                  isLoading={isLoading}
                  hasUnseenChanges={hasUnseenChanges}
                  hasPendingPlan={hasPendingPlan}
                  hasPendingQuestion={hasPendingQuestion}
                  isMultiSelectMode={isMultiSelectMode}
                  isChecked={isChecked}
                  onCheckboxClick={(e) => onCheckboxClick(e, chatId)}
                  gitOwner={gitOwner}
                  gitProvider={gitProvider}
                  showIcon={showIcon}
                />
              </div>
            )}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <div className="flex items-center gap-1">
                <span
                  ref={(el) => nameRefCallback(chatId, el)}
                  className="truncate block text-sm leading-tight flex-1"
                >
                  <TypewriterText
                    text={chatName || ""}
                    placeholder="New workspace"
                    id={chatId}
                    isJustCreated={isJustCreated}
                    showPlaceholder={true}
                  />
                </span>
                {/* Archive button or inline loader/status when icon is hidden */}
                {!isMultiSelectMode && !isMobileFullscreen && (
                  <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center relative">
                    {/* Inline loader/status when icon is hidden - always visible, hides on hover */}
                    {!showIcon && (hasPendingQuestion || isLoading || hasUnseenChanges || hasPendingPlan) && (
                      <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-150 group-hover:opacity-0">
                        <AnimatePresence mode="wait">
                          {hasPendingQuestion ? (
                            <motion.div
                              key="question"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                            >
                              <QuestionIcon className="w-2.5 h-2.5 text-blue-500" />
                            </motion.div>
                          ) : isLoading ? (
                            <motion.div
                              key="loading"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                            >
                              <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-muted-foreground" />
                            </motion.div>
                          ) : hasPendingPlan ? (
                            <motion.div
                              key="plan"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                              className="w-1.5 h-1.5 rounded-full bg-amber-500"
                            />
                          ) : (
                            <motion.div
                              key="unseen"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              transition={{ duration: 0.15 }}
                            >
                              <LoadingDot isLoading={false} className="w-2.5 h-2.5 text-muted-foreground" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                    {/* Archive button - appears on hover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onArchive(chatId)
                      }}
                      tabIndex={-1}
                      className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                      aria-label="Archive workspace"
                    >
                      <ArchiveIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 min-w-0">
                <span className="truncate flex-1 min-w-0">{displayText}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {stats && (stats.additions > 0 || stats.deletions > 0) && (
                    <>
                      <span className="text-green-600 dark:text-green-400">
                        +{stats.additions}
                      </span>
                      <span className="text-red-600 dark:text-red-400">
                        -{stats.deletions}
                      </span>
                    </>
                  )}
                  <span>
                    {formatTime(
                      chatUpdatedAt?.toISOString() ?? new Date().toISOString(),
                    )}
                  </span>
                </div>
              </div>
            </div>
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
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onArchive(chatId)} className="justify-between">
              Archive workspace
              <Kbd>{getShortcutKey("archiveAgent")}</Kbd>
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

// Custom comparator for ChatListSection to handle Set/Map props correctly
// Sets and Maps from Jotai atoms are stable by reference when unchanged,
// but we add explicit size checks for extra safety
function chatListSectionPropsAreEqual(
  prevProps: ChatListSectionProps,
  nextProps: ChatListSectionProps
): boolean {
  // Quick checks for primitive props that change often
  if (prevProps.selectedChatId !== nextProps.selectedChatId) return false
  if (prevProps.focusedChatIndex !== nextProps.focusedChatIndex) return false
  if (prevProps.isMultiSelectMode !== nextProps.isMultiSelectMode) return false
  if (prevProps.canShowPinOption !== nextProps.canShowPinOption) return false
  if (prevProps.areAllSelectedPinned !== nextProps.areAllSelectedPinned) return false
  if (prevProps.archivePending !== nextProps.archivePending) return false
  if (prevProps.archiveBatchPending !== nextProps.archiveBatchPending) return false
  if (prevProps.title !== nextProps.title) return false
  if (prevProps.isMobileFullscreen !== nextProps.isMobileFullscreen) return false
  if (prevProps.isDesktop !== nextProps.isDesktop) return false
  if (prevProps.showIcon !== nextProps.showIcon) return false

  // Check arrays by reference (they're stable from useMemo in parent)
  if (prevProps.chats !== nextProps.chats) return false
  if (prevProps.filteredChats !== nextProps.filteredChats) return false

  // Check Sets by reference - Jotai atoms return same reference if unchanged
  if (prevProps.loadingChatIds !== nextProps.loadingChatIds) return false
  if (prevProps.unseenChanges !== nextProps.unseenChanges) return false
  if (prevProps.workspacePendingPlans !== nextProps.workspacePendingPlans) return false
  if (prevProps.workspacePendingQuestions !== nextProps.workspacePendingQuestions) return false
  if (prevProps.selectedChatIds !== nextProps.selectedChatIds) return false
  if (prevProps.pinnedChatIds !== nextProps.pinnedChatIds) return false
  if (prevProps.justCreatedIds !== nextProps.justCreatedIds) return false

  // Check Maps by reference
  if (prevProps.projectsMap !== nextProps.projectsMap) return false
  if (prevProps.workspaceFileStats !== nextProps.workspaceFileStats) return false

  // Callback functions are stable from useCallback in parent
  // No need to compare them - they only change when their deps change

  return true
}

interface ChatListSectionProps {
  title: string
  chats: Array<{
    id: string
    name: string | null
    branch: string | null
    updatedAt: Date | null
    projectId: string
  }>
  selectedChatId: string | null
  focusedChatIndex: number
  loadingChatIds: Set<string>
  unseenChanges: Set<string>
  workspacePendingPlans: Set<string>
  workspacePendingQuestions: Set<string>
  isMultiSelectMode: boolean
  selectedChatIds: Set<string>
  isMobileFullscreen: boolean
  isDesktop: boolean
  pinnedChatIds: Set<string>
  projectsMap: Map<string, { gitOwner?: string | null; gitProvider?: string | null; gitRepo?: string | null; name?: string | null }>
  workspaceFileStats: Map<string, { fileCount: number; additions: number; deletions: number }>
  filteredChats: Array<{ id: string }>
  canShowPinOption: boolean
  areAllSelectedPinned: boolean
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
  justCreatedIds: Set<string>
}

// Memoized Chat List Section component
const ChatListSection = React.memo(function ChatListSection({
  title,
  chats,
  selectedChatId,
  focusedChatIndex,
  loadingChatIds,
  unseenChanges,
  workspacePendingPlans,
  workspacePendingQuestions,
  isMultiSelectMode,
  selectedChatIds,
  isMobileFullscreen,
  isDesktop,
  pinnedChatIds,
  projectsMap,
  workspaceFileStats,
  filteredChats,
  canShowPinOption,
  areAllSelectedPinned,
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
  justCreatedIds,
}: ChatListSectionProps) {
  if (chats.length === 0) return null

  // Pre-compute global indices map to avoid O(n²) findIndex in map()
  const globalIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    filteredChats.forEach((c, i) => map.set(c.id, i))
    return map
  }, [filteredChats])

  return (
    <>
      <div
        className={cn(
          "flex items-center h-4 mb-1",
          isMultiSelectMode ? "pl-3" : "pl-2",
        )}
      >
        <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
          {title}
        </h3>
      </div>
      <div className="list-none p-0 m-0 mb-3">
        {chats.map((chat) => {
          const isLoading = loadingChatIds.has(chat.id)
          const isSelected = selectedChatId === chat.id
          const isPinned = pinnedChatIds.has(chat.id)
          const globalIndex = globalIndexMap.get(chat.id) ?? -1
          const isFocused = focusedChatIndex === globalIndex && focusedChatIndex >= 0
          const project = projectsMap.get(chat.projectId)
          const repoName = project?.gitRepo || project?.name
          const displayText = chat.branch
            ? repoName
              ? `${repoName} • ${chat.branch}`
              : chat.branch
            : repoName || "Local project"
          const isChecked = selectedChatIds.has(chat.id)
          const stats = workspaceFileStats.get(chat.id)
          const hasPendingPlan = workspacePendingPlans.has(chat.id)
          const hasPendingQuestion = workspacePendingQuestions.has(chat.id)
          const isLastInFilteredChats = globalIndex === filteredChats.length - 1
          const isJustCreated = justCreatedIds.has(chat.id)

          return (
            <AgentChatItem
              key={chat.id}
              chatId={chat.id}
              chatName={chat.name}
              chatBranch={chat.branch}
              chatUpdatedAt={chat.updatedAt}
              chatProjectId={chat.projectId}
              globalIndex={globalIndex}
              isSelected={isSelected}
              isLoading={isLoading}
              hasUnseenChanges={unseenChanges.has(chat.id)}
              hasPendingPlan={hasPendingPlan}
              hasPendingQuestion={hasPendingQuestion}
              isMultiSelectMode={isMultiSelectMode}
              isChecked={isChecked}
              isFocused={isFocused}
              isMobileFullscreen={isMobileFullscreen}
              isDesktop={isDesktop}
              isPinned={isPinned}
              displayText={displayText}
              gitOwner={project?.gitOwner}
              gitProvider={project?.gitProvider}
              stats={stats}
              selectedChatIdsSize={selectedChatIds.size}
              canShowPinOption={canShowPinOption}
              areAllSelectedPinned={areAllSelectedPinned}
              filteredChatsLength={filteredChats.length}
              isLastInFilteredChats={isLastInFilteredChats}
              showIcon={showIcon}
              onChatClick={onChatClick}
              onCheckboxClick={onCheckboxClick}
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
              onArchive={onArchive}
              onTogglePin={onTogglePin}
              onRenameClick={onRenameClick}
              onCopyBranch={onCopyBranch}
              onArchiveAllBelow={onArchiveAllBelow}
              onArchiveOthers={onArchiveOthers}
              onBulkPin={onBulkPin}
              onBulkUnpin={onBulkUnpin}
              onBulkArchive={onBulkArchive}
              archivePending={archivePending}
              archiveBatchPending={archiveBatchPending}
              nameRefCallback={nameRefCallback}
              formatTime={formatTime}
              isJustCreated={isJustCreated}
            />
          )
        })}
      </div>
    </>
  )
}, chatListSectionPropsAreEqual)

interface AgentsSidebarProps {
  userId?: string | null | undefined
  clerkUser?: any
  desktopUser?: { id: string; email: string; name?: string } | null
  onSignOut?: () => void
  onToggleSidebar?: () => void
  isMobileFullscreen?: boolean
  onChatSelect?: () => void
}

// Memoized Archive Button to prevent re-creation on every sidebar render
const ArchiveButton = memo(forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  function ArchiveButton(props, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        {...props}
      >
        <ArchiveIcon className="h-4 w-4" />
      </button>
    )
  }
))

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
  isMobileFullscreen: boolean
  userId: string | null | undefined
  desktopUser: { id: string; email: string; name?: string } | null
  onSignOut: () => void
  onToggleSidebar?: () => void
  setSettingsDialogOpen: (open: boolean) => void
  setSettingsActiveTab: (tab: string) => void
  setShowAuthDialog: (open: boolean) => void
  handleSidebarMouseEnter: () => void
  handleSidebarMouseLeave: () => void
  closeButtonRef: React.RefObject<HTMLDivElement>
}

const SidebarHeader = memo(function SidebarHeader({
  isDesktop,
  isFullscreen,
  isMobileFullscreen,
  userId,
  desktopUser,
  onSignOut,
  onToggleSidebar,
  setSettingsDialogOpen,
  setSettingsActiveTab,
  setShowAuthDialog,
  handleSidebarMouseEnter,
  handleSidebarMouseLeave,
  closeButtonRef,
}: SidebarHeaderProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const showOfflineFeatures = useAtomValue(showOfflineModeFeaturesAtom)

  return (
    <div
      className="relative flex-shrink-0"
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      {/* Draggable area for window movement - background layer (hidden in fullscreen) */}
      {isDesktop && !isFullscreen && (
        <div
          className="absolute inset-x-0 top-0 h-[32px] z-0"
          style={{
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "drag",
          }}
          data-sidebar-content
        />
      )}

      {/* Custom traffic lights - positioned at top left, centered in 32px area */}
      <TrafficLights
        isHovered={isDropdownOpen}
        isFullscreen={isFullscreen}
        isDesktop={isDesktop}
        className="absolute left-4 top-[14px] z-20"
      />

      {/* Close button - positioned at top right */}
      {!isMobileFullscreen && (
        <div
          ref={closeButtonRef}
          className={cn(
            "absolute right-2 z-20 transition-opacity duration-150",
            "top-2",
          )}
          style={{
            opacity: isDropdownOpen ? 1 : 0,
            // @ts-expect-error - WebKit-specific property
            WebkitAppRegion: "no-drag",
          }}
        >
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <ButtonCustom
                variant="ghost"
                size="icon"
                onClick={onToggleSidebar}
                tabIndex={-1}
                className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
                aria-label="Close sidebar"
              >
                <IconDoubleChevronLeft className="h-4 w-4" />
              </ButtonCustom>
            </TooltipTrigger>
            <TooltipContent>
              Close sidebar
              <Kbd>⌘\</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Spacer for macOS traffic lights */}
      <TrafficLightSpacer isFullscreen={isFullscreen} isDesktop={isDesktop} />

      {/* Team dropdown - below traffic lights */}
      <div className="px-2 pt-2 pb-2">
        <div className="flex items-center gap-1">
          <div className="flex-1 min-w-0">
            <DropdownMenu
              open={isDropdownOpen}
              onOpenChange={setIsDropdownOpen}
            >
              <DropdownMenuTrigger asChild>
                <ButtonCustom
                  variant="ghost"
                  className="h-6 px-1.5 justify-start hover:bg-foreground/10 rounded-md group/team-button max-w-full"
                  suppressHydrationWarning
                >
                  <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                    <div className="flex items-center justify-center flex-shrink-0">
                      <Logo className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="text-sm font-medium text-foreground truncate">
                        1Code
                      </div>
                    </div>
                    {showOfflineFeatures && (
                      <div className="flex-shrink-0">
                        <NetworkStatus />
                      </div>
                    )}
                    <ChevronDown
                      className={cn(
                        "h-3 text-muted-foreground flex-shrink-0 overflow-hidden",
                        isDropdownOpen
                          ? "opacity-100 w-3"
                          : "opacity-0 w-0 group-hover/team-button:opacity-100 group-hover/team-button:w-3",
                      )}
                    />
                  </div>
                </ButtonCustom>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-52 pt-0"
                sideOffset={8}
              >
                {userId ? (
                  <>
                    {/* Project section at the top */}
                    <div className="relative rounded-t-xl border-b overflow-hidden">
                      <div className="absolute inset-0 bg-popover brightness-110" />
                      <div className="relative pl-2 pt-1.5 pb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded flex items-center justify-center bg-background flex-shrink-0 overflow-hidden">
                            <Logo className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="font-medium text-sm text-foreground truncate">
                              {desktopUser?.name || "User"}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {desktopUser?.email}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Settings */}
                    <DropdownMenuItem
                      className="gap-2"
                      onSelect={() => {
                        setIsDropdownOpen(false)
                        setSettingsActiveTab("profile")
                        setSettingsDialogOpen(true)
                      }}
                    >
                      <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      Settings
                    </DropdownMenuItem>

                    {/* Help Submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <QuestionCircleIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1">Help</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        className="w-36"
                        sideOffset={6}
                        alignOffset={-4}
                      >
                        <DropdownMenuItem
                          onSelect={() => {
                            window.open(
                              "https://discord.gg/8ektTZGnj4",
                              "_blank",
                            )
                            setIsDropdownOpen(false)
                          }}
                          className="gap-2"
                        >
                          <DiscordIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1">Discord</span>
                        </DropdownMenuItem>
                        {!isMobileFullscreen && (
                          <DropdownMenuItem
                            onSelect={() => {
                              setIsDropdownOpen(false)
                              setSettingsActiveTab("keyboard")
                              setSettingsDialogOpen(true)
                            }}
                            className="gap-2"
                          >
                            <KeyboardIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1">Shortcuts</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Log out */}
                    <div className="">
                      <DropdownMenuItem
                        className="gap-2"
                        onSelect={() => onSignOut()}
                      >
                        <svg
                          className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <polyline
                            points="16,17 21,12 16,7"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <line
                            x1="21"
                            y1="12"
                            x2="9"
                            y2="12"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Log out
                      </DropdownMenuItem>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Login for unauthenticated users */}
                    <div className="">
                      <DropdownMenuItem
                        className="gap-2"
                        onSelect={() => {
                          setIsDropdownOpen(false)
                          setShowAuthDialog(true)
                        }}
                      >
                        <ProfileIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        Login
                      </DropdownMenuItem>
                    </div>

                    <DropdownMenuSeparator />

                    {/* Help Submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="gap-2">
                        <QuestionCircleIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="flex-1">Help</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent
                        className="w-36"
                        sideOffset={6}
                        alignOffset={-4}
                      >
                        <DropdownMenuItem
                          onSelect={() => {
                            window.open(
                              "https://discord.gg/8ektTZGnj4",
                              "_blank",
                            )
                            setIsDropdownOpen(false)
                          }}
                          className="gap-2"
                        >
                          <DiscordIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="flex-1">Discord</span>
                        </DropdownMenuItem>
                        {!isMobileFullscreen && (
                          <DropdownMenuItem
                            onSelect={() => {
                              setIsDropdownOpen(false)
                              setSettingsActiveTab("keyboard")
                              setSettingsDialogOpen(true)
                            }}
                            className="gap-2"
                          >
                            <KeyboardIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="flex-1">Shortcuts</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
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
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
              suppressHydrationWarning
            >
              <QuestionCircleIcon className="h-4 w-4" />
            </button>
          </AgentsHelpPopover>
        </div>
      </TooltipTrigger>
      <TooltipContent>Help</TooltipContent>
    </Tooltip>
  )
})

export function AgentsSidebar({
  userId = "demo-user-id",
  clerkUser = null,
  desktopUser = {
    id: "demo-user-id",
    email: "demo@example.com",
    name: "Demo User",
  },
  onSignOut = () => {},
  onToggleSidebar,
  isMobileFullscreen = false,
  onChatSelect,
}: AgentsSidebarProps) {
  const [selectedChatId, setSelectedChatId] = useAtom(selectedAgentChatIdAtom)
  const previousChatId = useAtomValue(previousAgentChatIdAtom)
  const autoAdvanceTarget = useAtomValue(autoAdvanceTargetAtom)
  const [selectedDraftId, setSelectedDraftId] = useAtom(selectedDraftIdAtom)
  const [loadingSubChats] = useAtom(loadingSubChatsAtom)
  const pendingQuestions = useAtomValue(pendingUserQuestionsAtom)
  // Use ref instead of state to avoid re-renders on hover
  const isSidebarHoveredRef = useRef(false)
  const closeButtonRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
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
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Agent name tooltip refs (for truncated names) - using DOM manipulation to avoid re-renders
  const agentTooltipRef = useRef<HTMLDivElement>(null)
  const nameRefs = useRef<Map<string, HTMLSpanElement>>(new Map())
  const agentTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

  const setSettingsDialogOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const setSettingsActiveTab = useSetAtom(agentsSettingsDialogActiveTabAtom)
  const { isLoaded: isAuthLoaded } = useCombinedAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const setCreateTeamDialogOpen = useSetAtom(createTeamDialogOpenAtom)

  // Debug mode for testing first-time user experience
  const debugMode = useAtomValue(agentsDebugModeAtom)

  // Sidebar appearance settings
  const showWorkspaceIcon = useAtomValue(showWorkspaceIconAtom)

  // Desktop: use selectedProject instead of teams
  const [selectedProject] = useAtom(selectedProjectAtom)

  // Fetch all chats (no project filter)
  const { data: agentChats } = trpc.chats.list.useQuery({})

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

    const allIds: string[] = []
    for (const chat of agentChats) {
      try {
        const stored = localStorage.getItem(`agent-open-sub-chats-${chat.id}`)
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

  // Get utils outside of callbacks - hooks must be called at top level
  const utils = trpc.useUtils()

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
  }, [undoStack, setUndoStack, restoreChatMutation])

  // Batch archive mutation
  const archiveChatsBatchMutation = trpc.chats.archiveBatch.useMutation({
    onSuccess: (_, variables) => {
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

    // Optimistically update the query cache
    utils.chats.list.setData({}, (old) => {
      if (!old) return old
      return old.map((c) => (c.id === chatId ? { ...c, name: newName } : c))
    })

    setRenameLoading(true)

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

  // Get clerk username
  const clerkUsername = clerkUser?.username

  // Filter and separate pinned/unpinned agents
  const { pinnedAgents, unpinnedAgents, filteredChats } = useMemo(() => {
    if (!agentChats)
      return { pinnedAgents: [], unpinnedAgents: [], filteredChats: [] }

    const filtered = searchQuery.trim()
      ? agentChats.filter((chat) =>
          chat.name.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : agentChats

    const pinned = filtered.filter((chat) => pinnedChatIds.has(chat.id))
    const unpinned = filtered.filter((chat) => !pinnedChatIds.has(chat.id))

    return {
      pinnedAgents: pinned,
      unpinnedAgents: unpinned,
      filteredChats: [...pinned, ...unpinned],
    }
  }, [searchQuery, agentChats, pinnedChatIds])

  // Handle bulk archive of selected chats
  const handleBulkArchive = useCallback(() => {
    const chatIdsToArchive = Array.from(selectedChatIds)
    if (chatIdsToArchive.length === 0) return

    // If active chat is being archived, navigate to previous or new workspace
    const isArchivingActiveChat =
      selectedChatId && chatIdsToArchive.includes(selectedChatId)

    archiveChatsBatchMutation.mutate(
      { chatIds: chatIdsToArchive },
      {
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
      },
    )
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

      const chatsToArchive = filteredChats
        .slice(currentIndex + 1)
        .map((c) => c.id)

      if (chatsToArchive.length > 0) {
        archiveChatsBatchMutation.mutate({ chatIds: chatsToArchive })
      }
    },
    [filteredChats, archiveChatsBatchMutation],
  )

  const handleArchiveOthers = useCallback(
    (chatId: string) => {
      const chatsToArchive = filteredChats
        .filter((c) => c.id !== chatId)
        .map((c) => c.id)

      if (chatsToArchive.length > 0) {
        archiveChatsBatchMutation.mutate({ chatIds: chatsToArchive })
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
      if (isMobileFullscreen && onChatSelect) {
        onChatSelect()
      }
    },
    [setSelectedChatId, setSelectedDraftId, isMobileFullscreen, onChatSelect],
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

  // Convert file stats from DB to a Map for easy lookup
  const workspaceFileStats = useMemo(() => {
    const statsMap = new Map<string, { fileCount: number; additions: number; deletions: number }>()
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
    // On mobile, switch to chat mode to show NewChatForm
    if (isMobileFullscreen && onChatSelect) {
      onChatSelect()
    }
  }

  const handleChatClick = useCallback((
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
    setSelectedChatId(chatId)
    // On mobile, notify parent to switch to chat mode
    if (isMobileFullscreen && onChatSelect) {
      onChatSelect()
    }
  }, [filteredChats, selectedChatId, selectedChatIds, toggleChatSelection, setSelectedChatIds, setSelectedChatId, isMobileFullscreen, onChatSelect])

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
    // Fetch both session count and worktree status in parallel
    const [sessionCount, worktreeStatus] = await Promise.all([
      utils.terminal.getActiveSessionCount.fetch({ workspaceId: chatId }),
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
  }, [archiveChatMutation, utils.terminal.getActiveSessionCount, utils.chats.getWorktreeStatus])

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

  // Update sidebar hover UI via DOM manipulation (no state update to avoid re-renders)
  const updateSidebarHoverUI = useCallback((hovered: boolean) => {
    isSidebarHoveredRef.current = hovered
    // Update close button opacity
    if (closeButtonRef.current) {
      closeButtonRef.current.style.opacity = hovered ? "1" : "0"
    }
    // Update native traffic light visibility
    if (typeof window !== "undefined" && window.desktopApi?.setTrafficLightVisibility) {
      window.desktopApi.setTrafficLightVisibility(hovered)
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

  // Mobile fullscreen mode - render without ResizableSidebar wrapper
  const sidebarContent = (
    <div
      className={cn(
        "group/sidebar flex flex-col gap-0 overflow-hidden select-none",
        isMobileFullscreen
          ? "h-full w-full bg-background"
          : "h-full bg-tl-background",
      )}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
      data-mobile-fullscreen={isMobileFullscreen || undefined}
      data-sidebar-content
    >
      {/* Header area - isolated component to prevent re-renders when dropdown opens */}
      <SidebarHeader
        isDesktop={isDesktop}
        isFullscreen={isFullscreen}
        isMobileFullscreen={isMobileFullscreen}
        userId={userId}
        desktopUser={desktopUser}
        onSignOut={onSignOut}
        onToggleSidebar={onToggleSidebar}
        setSettingsDialogOpen={setSettingsDialogOpen}
        setSettingsActiveTab={setSettingsActiveTab}
        setShowAuthDialog={setShowAuthDialog}
        handleSidebarMouseEnter={handleSidebarMouseEnter}
        handleSidebarMouseLeave={handleSidebarMouseLeave}
        closeButtonRef={closeButtonRef}
      />

      {/* Search and New Workspace */}
      <div className="px-2 pb-3 flex-shrink-0">
        <div className="space-y-2">
          {/* Search Input */}
          <div className="relative">
            <Input
              ref={searchInputRef}
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault()
                  searchInputRef.current?.blur()
                  setFocusedChatIndex(-1) // Reset focus
                  return
                }

                if (e.key === "ArrowDown") {
                  e.preventDefault()
                  setFocusedChatIndex((prev) => {
                    // If no focus yet, start from first item
                    if (prev === -1) return 0
                    // Otherwise move down
                    return prev < filteredChats.length - 1 ? prev + 1 : prev
                  })
                  return
                }

                if (e.key === "ArrowUp") {
                  e.preventDefault()
                  setFocusedChatIndex((prev) => {
                    // If no focus yet, start from last item
                    if (prev === -1) return filteredChats.length - 1
                    // Otherwise move up
                    return prev > 0 ? prev - 1 : prev
                  })
                  return
                }

                if (e.key === "Enter") {
                  e.preventDefault()
                  // Only open if something is focused (not -1)
                  if (focusedChatIndex >= 0) {
                    const focusedChat = filteredChats[focusedChatIndex]
                    if (focusedChat) {
                      handleChatClick(focusedChat.id)
                      searchInputRef.current?.blur()
                      setFocusedChatIndex(-1) // Reset focus after selection
                    }
                  }
                  return
                }
              }}
              className={cn(
                "w-full rounded-lg text-sm bg-muted border border-input placeholder:text-muted-foreground/40",
                isMobileFullscreen ? "h-10" : "h-7",
              )}
            />
          </div>
          {/* New Workspace Button */}
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <ButtonCustom
                onClick={handleNewAgent}
                variant="outline"
                size="sm"
                className={cn(
                  "px-2 w-full hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground rounded-lg gap-1.5",
                  isMobileFullscreen ? "h-10" : "h-7",
                )}
              >
                <span className="text-sm font-medium">New Workspace</span>
              </ButtonCustom>
            </TooltipTrigger>
            <TooltipContent side="right">
              Start a new workspace
              <Kbd>{getShortcutKey("newAgent")}</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Scrollable Agents List */}
      <div className="flex-1 min-h-0 relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleAgentsScroll}
          className={cn(
            "h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent",
            isMultiSelectMode ? "px-0" : "px-2",
          )}
        >
          {/* Drafts Section - always show if there are drafts */}
          {drafts.length > 0 && !searchQuery && (
            <div className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}>
              <div
                className={cn(
                  "flex items-center h-4 mb-1",
                  isMultiSelectMode ? "pl-3" : "pl-2",
                )}
              >
                <h3 className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  Drafts
                </h3>
              </div>
              <div className="list-none p-0 m-0">
                {drafts.map((draft) => (
                  <DraftItem
                    key={draft.id}
                    draftId={draft.id}
                    draftText={draft.text}
                    draftUpdatedAt={draft.updatedAt}
                    projectGitOwner={draft.project?.gitOwner}
                    projectGitProvider={draft.project?.gitProvider}
                    projectGitRepo={draft.project?.gitRepo}
                    projectName={draft.project?.name}
                    isSelected={selectedDraftId === draft.id && !selectedChatId}
                    isMultiSelectMode={isMultiSelectMode}
                    isMobileFullscreen={isMobileFullscreen}
                    showIcon={showWorkspaceIcon}
                    onSelect={handleDraftSelect}
                    onDelete={handleDeleteDraft}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Chats Section */}
          {filteredChats.length > 0 ? (
            <div className={cn("mb-4", isMultiSelectMode ? "px-0" : "-mx-1")}>
              {/* Pinned section */}
              <ChatListSection
                title="Pinned workspaces"
                chats={pinnedAgents}
                selectedChatId={selectedChatId}
                focusedChatIndex={focusedChatIndex}
                loadingChatIds={loadingChatIds}
                unseenChanges={unseenChanges}
                workspacePendingPlans={workspacePendingPlans}
                workspacePendingQuestions={workspacePendingQuestions}
                isMultiSelectMode={isMultiSelectMode}
                selectedChatIds={selectedChatIds}
                isMobileFullscreen={isMobileFullscreen}
                isDesktop={isDesktop}
                pinnedChatIds={pinnedChatIds}
                projectsMap={projectsMap}
                workspaceFileStats={workspaceFileStats}
                filteredChats={filteredChats}
                canShowPinOption={canShowPinOption}
                areAllSelectedPinned={areAllSelectedPinned}
                showIcon={showWorkspaceIcon}
                onChatClick={handleChatClick}
                onCheckboxClick={handleCheckboxClick}
                onMouseEnter={handleAgentMouseEnter}
                onMouseLeave={handleAgentMouseLeave}
                onArchive={handleArchiveSingle}
                onTogglePin={handleTogglePin}
                onRenameClick={handleRenameClick}
                onCopyBranch={handleCopyBranch}
                onArchiveAllBelow={handleArchiveAllBelow}
                onArchiveOthers={handleArchiveOthers}
                onBulkPin={handleBulkPin}
                onBulkUnpin={handleBulkUnpin}
                onBulkArchive={handleBulkArchive}
                archivePending={archiveChatMutation.isPending}
                archiveBatchPending={archiveChatsBatchMutation.isPending}
                nameRefCallback={nameRefCallback}
                formatTime={formatTime}
                justCreatedIds={justCreatedIds}
              />

              {/* Unpinned section */}
              <ChatListSection
                title={pinnedAgents.length > 0 ? "Recent workspaces" : "Workspaces"}
                chats={unpinnedAgents}
                selectedChatId={selectedChatId}
                focusedChatIndex={focusedChatIndex}
                loadingChatIds={loadingChatIds}
                unseenChanges={unseenChanges}
                workspacePendingPlans={workspacePendingPlans}
                workspacePendingQuestions={workspacePendingQuestions}
                isMultiSelectMode={isMultiSelectMode}
                selectedChatIds={selectedChatIds}
                isMobileFullscreen={isMobileFullscreen}
                isDesktop={isDesktop}
                pinnedChatIds={pinnedChatIds}
                projectsMap={projectsMap}
                workspaceFileStats={workspaceFileStats}
                filteredChats={filteredChats}
                canShowPinOption={canShowPinOption}
                areAllSelectedPinned={areAllSelectedPinned}
                showIcon={showWorkspaceIcon}
                onChatClick={handleChatClick}
                onCheckboxClick={handleCheckboxClick}
                onMouseEnter={handleAgentMouseEnter}
                onMouseLeave={handleAgentMouseLeave}
                onArchive={handleArchiveSingle}
                onTogglePin={handleTogglePin}
                onRenameClick={handleRenameClick}
                onCopyBranch={handleCopyBranch}
                onArchiveAllBelow={handleArchiveAllBelow}
                onArchiveOthers={handleArchiveOthers}
                onBulkPin={handleBulkPin}
                onBulkUnpin={handleBulkUnpin}
                onBulkArchive={handleBulkArchive}
                archivePending={archiveChatMutation.isPending}
                archiveBatchPending={archiveChatsBatchMutation.isPending}
                nameRefCallback={nameRefCallback}
                formatTime={formatTime}
                justCreatedIds={justCreatedIds}
              />
            </div>
          ) : null}
        </div>

        {/* Top gradient fade (appears when scrolled down) */}
        {/* Top gradient fade (appears when scrolled down) */}
        <div
          ref={topGradientRef}
          className="absolute top-0 left-0 right-0 h-10 pointer-events-none bg-gradient-to-b from-tl-background via-tl-background/50 to-transparent transition-opacity duration-200 opacity-0"
        />

        {/* Bottom gradient fade */}
        <div
          ref={bottomGradientRef}
          className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-tl-background via-tl-background/50 to-transparent transition-opacity duration-200 opacity-0"
        />
      </div>

      {/* Footer - Multi-select toolbar or normal footer */}
      <AnimatePresence mode="wait">
        {isMultiSelectMode ? (
          <motion.div
            key="multi-select-footer"
            initial={hasFooterAnimated.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            onAnimationComplete={() => {
              hasFooterAnimated.current = true
            }}
            className="p-2 flex flex-col gap-2"
          >
            {/* Selection info */}
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-muted-foreground">
                {selectedChatsCount} selected
              </span>
              <button
                onClick={clearChatSelection}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkArchive}
                disabled={archiveChatsBatchMutation.isPending}
                className="flex-1 h-8 gap-1.5 text-xs rounded-lg"
              >
                <ArchiveIcon className="h-3.5 w-3.5" />
                {archiveChatsBatchMutation.isPending
                  ? "Archiving..."
                  : "Archive"}
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="normal-footer"
            initial={hasFooterAnimated.current ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0 }}
            onAnimationComplete={() => {
              hasFooterAnimated.current = true
            }}
            className="p-2 pt-2 flex flex-col gap-2"
          >
            <div className="flex items-center">
              <div className="flex items-center gap-1">
                {/* Settings Button */}
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsActiveTab("profile")
                        setSettingsDialogOpen(true)
                      }}
                      className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
                    >
                      <SettingsIcon className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>

                {/* Help Button - isolated component to prevent sidebar re-renders */}
                <HelpSection isMobile={isMobileFullscreen} />

                {/* Archive Button - isolated component to prevent sidebar re-renders */}
                <ArchiveSection archivedChatsCount={archivedChatsCount} />
              </div>

              <div className="flex-1" />
            </div>

            {/* Feedback Button */}
            <ButtonCustom
              onClick={() => window.open(FEEDBACK_URL, "_blank")}
              variant="outline"
              size="sm"
              className={cn(
                "px-2 w-full hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground rounded-lg gap-1.5",
                isMobileFullscreen ? "h-10" : "h-7",
              )}
            >
              <span className="text-sm font-medium">Feedback</span>
            </ButtonCustom>
          </motion.div>
        )}
      </AnimatePresence>
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

      {/* Auth Dialog */}
      <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />

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
