import { memo } from "react"
import { AnimatePresence, motion } from "motion/react"
import { formatTimeAgo } from "../../../lib/utils/format-time-ago"
import { cn } from "../../../lib/utils"
import type { SubChatStatus } from "../lib/derive-status"
import { LoadingDot, QuestionIcon, ArchiveIcon } from "../../../components/ui/icons"
import { Pin } from "lucide-react"
import { Checkbox } from "../../../components/ui/checkbox"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "../../../components/ui/context-menu"

export interface KanbanCardData {
  id: string
  name: string | null
  chatId: string
  chatName: string | null
  projectName: string | null
  branch: string | null
  mode: "plan" | "agent"
  status: SubChatStatus
  hasUnseenChanges: boolean
  hasPendingPlan: boolean
  hasPendingQuestion: boolean
  createdAt: Date
  updatedAt: Date | null
  isDraft?: boolean
  stats?: { fileCount: number; additions: number; deletions: number }
  isPinned?: boolean
  isSelected?: boolean
}

interface KanbanCardProps {
  card: KanbanCardData
  isMultiSelectMode: boolean
  onClick: (e: React.MouseEvent) => void
  onCheckboxClick: (e: React.MouseEvent, chatId: string) => void
  onTogglePin: (chatId: string) => void
  onRename: (chat: { id: string; name: string | null }) => void
  onArchive: (chatId: string) => void
  onCopyBranch: (branch: string) => void
  onExportChat: (params: { chatId: string; format: "markdown" | "json" | "text" }) => void
  onCopyChat: (params: { chatId: string; format: "markdown" | "json" | "text" }) => void
}

export const KanbanCard = memo(function KanbanCard({
  card,
  isMultiSelectMode,
  onClick,
  onCheckboxClick,
  onTogglePin,
  onRename,
  onArchive,
  onCopyBranch,
  onExportChat,
  onCopyChat,
}: KanbanCardProps) {
  const timeAgo = formatTimeAgo(card.updatedAt || card.createdAt)

  // Build display text: projectName + branch (if exists)
  const displayText = card.branch
    ? card.projectName
      ? `${card.projectName} • ${card.branch}`
      : card.branch
    : card.projectName || "Local project"

  // Status flags
  const isLoading = card.status === "in-progress"
  const hasUnseenChanges = card.hasUnseenChanges
  const hasPendingPlan = card.hasPendingPlan
  const hasPendingQuestion = card.hasPendingQuestion

  // Show status indicator if there's something to show (pin has lowest priority)
  const showStatusIndicator = hasPendingQuestion || isLoading || hasPendingPlan || hasUnseenChanges || card.isPinned

  // Card content (shared between draft and regular cards)
  const cardContent = (
    <div className="flex items-start gap-2.5">
      {/* Checkbox for multi-select mode */}
      {isMultiSelectMode && !card.isDraft && (
        <div className="pt-0.5 flex-shrink-0">
          <Checkbox
            checked={card.isSelected}
            onClick={(e) => onCheckboxClick(e, card.chatId)}
            className="h-4 w-4"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* First row: name + status indicator (справа!) */}
        <div className="flex items-center gap-1">
          <span className="truncate block text-sm leading-tight flex-1">
            {card.name || "New Workspace"}
          </span>

          {/* Status indicator container - справа от названия */}
          {!isMultiSelectMode && (
            <div className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center relative">
              {/* Indicator - absolute, скрывается при hover */}
              {showStatusIndicator && (
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
                    ) : hasUnseenChanges ? (
                      <motion.div
                        key="unseen"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                      >
                        <LoadingDot isLoading={false} className="w-2.5 h-2.5 text-muted-foreground" />
                      </motion.div>
                    ) : card.isPinned ? (
                      <motion.div
                        key="pinned"
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.5 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Pin className="w-2.5 h-2.5 text-muted-foreground/60" />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )}

              {/* Archive button - absolute, appears on hover */}
              {!card.isDraft && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onArchive(card.chatId)
                  }}
                  tabIndex={-1}
                  className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-foreground active:text-foreground transition-[opacity,transform,color] duration-150 ease-out opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto active:scale-[0.97]"
                  aria-label="Archive workspace"
                >
                  <ArchiveIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Second row: project/branch + stats + time */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 min-w-0">
          <span className="truncate flex-1 min-w-0">{displayText}</span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {card.stats && (card.stats.additions > 0 || card.stats.deletions > 0) && (
              <>
                <span className="text-green-600 dark:text-green-400">
                  +{card.stats.additions}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  -{card.stats.deletions}
                </span>
              </>
            )}
            <span>{timeAgo}</span>
          </div>
        </div>
      </div>
    </div>
  )

  // Don't show context menu for drafts
  if (card.isDraft) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full text-left py-1.5 cursor-pointer group relative",
          "pl-2 pr-2 rounded-md",
          "bg-card border border-border/50",
          "hover:bg-accent/50 hover:border-border",
          "transition-colors duration-75",
          "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
        )}
      >
        {cardContent}
      </button>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            "w-full text-left py-1.5 cursor-pointer group relative",
            "pl-2 pr-2 rounded-md",
            "bg-card border border-border/50",
            "hover:bg-accent/50 hover:border-border",
            "transition-colors duration-75",
            "outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70",
            card.isSelected && "bg-primary/10 border-primary/30"
          )}
        >
          {cardContent}
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onClick={() => onTogglePin(card.chatId)}>
          {card.isPinned ? "Unpin workspace" : "Pin workspace"}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRename({ id: card.chatId, name: card.name })}>
          Rename workspace
        </ContextMenuItem>
        {card.branch && (
          <ContextMenuItem onClick={() => onCopyBranch(card.branch!)}>
            Copy branch name
          </ContextMenuItem>
        )}
        <ContextMenuSub>
          <ContextMenuSubTrigger>Export workspace</ContextMenuSubTrigger>
          <ContextMenuSubContent sideOffset={6} alignOffset={-4}>
            <ContextMenuItem onClick={() => onExportChat({ chatId: card.chatId, format: "markdown" })}>
              Download as Markdown
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onExportChat({ chatId: card.chatId, format: "json" })}>
              Download as JSON
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onExportChat({ chatId: card.chatId, format: "text" })}>
              Download as Text
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => onCopyChat({ chatId: card.chatId, format: "markdown" })}>
              Copy as Markdown
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onCopyChat({ chatId: card.chatId, format: "json" })}>
              Copy as JSON
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onCopyChat({ chatId: card.chatId, format: "text" })}>
              Copy as Text
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {typeof window !== "undefined" && window.desktopApi && (
          <ContextMenuItem onClick={() => window.desktopApi?.newWindow({ chatId: card.chatId })}>
            Open in new window
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => onArchive(card.chatId)}>
          Archive workspace
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
})
