import { memo, useMemo } from "react"
import { KanbanColumn } from "./kanban-column"
import type { KanbanCardData } from "./kanban-card"
import type { SubChatStatus } from "../lib/derive-status"

interface KanbanBoardProps {
  cards: KanbanCardData[]
  pinnedChatIds: Set<string>
  isMultiSelectMode: boolean
  selectedChatIds: Set<string>
  onCardClick: (card: KanbanCardData, e: React.MouseEvent) => void
  onCheckboxClick: (e: React.MouseEvent, chatId: string) => void
  onTogglePin: (chatId: string) => void
  onRename: (chat: { id: string; name: string | null }) => void
  onArchive: (chatId: string) => void
  onCopyBranch: (branch: string) => void
  onExportChat: (params: { chatId: string; format: "markdown" | "json" | "text" }) => void
  onCopyChat: (params: { chatId: string; format: "markdown" | "json" | "text" }) => void
}

// 4 columns: drafts + workspace statuses
const COLUMNS: { status: SubChatStatus; title: string }[] = [
  { status: "draft", title: "Drafts" },
  { status: "in-progress", title: "In Progress" },
  { status: "needs-input", title: "Need Input" },
  { status: "done", title: "Done" },
]

export const KanbanBoard = memo(function KanbanBoard({
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
}: KanbanBoardProps) {
  // Group cards by status
  const cardsByStatus = useMemo(() => {
    const grouped: Record<SubChatStatus, KanbanCardData[]> = {
      draft: [],
      "in-progress": [],
      "needs-input": [],
      done: [],
    }

    for (const card of cards) {
      grouped[card.status].push(card)
    }

    return grouped
  }, [cards])

  return (
    <div className="h-full overflow-x-auto">
      {/* Centered container with max-width */}
      <div className="flex gap-3 h-full px-4 py-2 mx-auto max-w-5xl min-w-min">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.status}
            title={column.title}
            status={column.status}
            cards={cardsByStatus[column.status]}
            isMultiSelectMode={isMultiSelectMode}
            onCardClick={onCardClick}
            onCheckboxClick={onCheckboxClick}
            onTogglePin={onTogglePin}
            onRename={onRename}
            onArchive={onArchive}
            onCopyBranch={onCopyBranch}
            onExportChat={onExportChat}
            onCopyChat={onCopyChat}
          />
        ))}
      </div>
    </div>
  )
})
