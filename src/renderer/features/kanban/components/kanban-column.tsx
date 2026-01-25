import { memo, useMemo } from "react"
import { cn } from "../../../lib/utils"
import { KanbanCard, type KanbanCardData } from "./kanban-card"
import type { SubChatStatus } from "../lib/derive-status"

interface KanbanColumnProps {
  title: string
  status: SubChatStatus
  cards: KanbanCardData[]
  isMultiSelectMode: boolean
  onCardClick: (card: KanbanCardData, e: React.MouseEvent) => void
  onCheckboxClick: (e: React.MouseEvent, chatId: string) => void
  onTogglePin: (chatId: string) => void
  onRename: (chat: { id: string; name: string | null }) => void
  onArchive: (chatId: string) => void
  onCopyBranch: (branch: string) => void
  onExportChat: (params: { chatId: string; format: "markdown" | "json" | "text" }) => void
  onCopyChat: (params: { chatId: string; format: "markdown" | "json" | "text" }) => void
}

const STATUS_COLORS: Record<SubChatStatus, string> = {
  draft: "bg-muted-foreground/20",
  "in-progress": "bg-blue-500",
  "needs-input": "bg-amber-500",
  done: "bg-emerald-500",
}

export const KanbanColumn = memo(function KanbanColumn({
  title,
  status,
  cards,
  isMultiSelectMode,
  onCardClick,
  onCheckboxClick,
  onTogglePin,
  onRename,
  onArchive,
  onCopyBranch,
  onExportChat,
  onCopyChat,
}: KanbanColumnProps) {
  // Sort cards: pinned first, then by updatedAt desc
  const sortedCards = useMemo(() => {
    const pinned = cards.filter((c) => c.isPinned)
    const unpinned = cards.filter((c) => !c.isPinned)

    // Sort each group by updatedAt desc
    const sortByDate = (a: KanbanCardData, b: KanbanCardData) => {
      const aTime = a.updatedAt?.getTime() || a.createdAt.getTime()
      const bTime = b.updatedAt?.getTime() || b.createdAt.getTime()
      return bTime - aTime
    }

    pinned.sort(sortByDate)
    unpinned.sort(sortByDate)

    return [...pinned, ...unpinned]
  }, [cards])

  return (
    <div className="flex flex-col min-w-[140px] max-w-[240px] flex-1 h-full">
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-2 mb-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            STATUS_COLORS[status]
          )}
        />
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">
          {cards.length}
        </span>
      </div>

      {/* Cards container with scroll */}
      <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-2">
        {sortedCards.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground/60">
            No workspaces
          </div>
        ) : (
          sortedCards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              isMultiSelectMode={isMultiSelectMode}
              onClick={(e) => onCardClick(card, e)}
              onCheckboxClick={onCheckboxClick}
              onTogglePin={onTogglePin}
              onRename={onRename}
              onArchive={onArchive}
              onCopyBranch={onCopyBranch}
              onExportChat={onExportChat}
              onCopyChat={onCopyChat}
            />
          ))
        )}
      </div>
    </div>
  )
})
