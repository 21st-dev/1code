"use client"

import { memo, useState, useCallback, useEffect, useMemo } from "react"
import { ChevronDown, ArrowUp, X, GripVertical } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import type { AgentQueueItem } from "../lib/queue-utils"
import { RenderFileMentions } from "../mentions/render-file-mentions"
import { getWindowId } from "../../../contexts/WindowContext"

// Window-scoped key so each window has its own queue expanded state
const getQueueExpandedKey = () => `${getWindowId()}:agent-queue-expanded`

// Queue item row component
const QueueItemRow = memo(function QueueItemRow({
  item,
  onRemove,
  onSendNow,
  isReorderable = false,
}: {
  item: AgentQueueItem
  onRemove?: (itemId: string) => void
  onSendNow?: (itemId: string) => void
  isReorderable?: boolean
}) {
  // Items currently being processed must not be draggable — the queue processor
  // and the user would fight over ordering, and the row would disappear mid-drag.
  const isDraggable = isReorderable && item.status !== "processing"
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled: !isDraggable })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  }

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onRemove?.(item.id)
    },
    [item.id, onRemove]
  )

  const handleSendNow = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSendNow?.(item.id)
    },
    [item.id, onSendNow]
  )

  // Build attachment summary parts by type (matching sent message bubble style)
  const attachmentParts: string[] = []
  const imageCount = item.images?.length || 0
  const fileCount = item.files?.length || 0
  const quoteCount = item.textContexts?.length || 0
  const diffCount = item.diffTextContexts?.length || 0
  const pastedCount = item.pastedTexts?.length || 0

  if (imageCount > 0) {
    attachmentParts.push(imageCount === 1 ? "image" : `${imageCount} images`)
  }
  if (fileCount > 0) {
    attachmentParts.push(fileCount === 1 ? "file" : `${fileCount} files`)
  }
  if (quoteCount > 0) {
    attachmentParts.push(quoteCount === 1 ? "selected text" : `${quoteCount} text selections`)
  }
  if (pastedCount > 0) {
    attachmentParts.push(pastedCount === 1 ? "pasted text" : `${pastedCount} pasted texts`)
  }
  if (diffCount > 0) {
    attachmentParts.push(diffCount === 1 ? "code selection" : `${diffCount} code selections`)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/queue-row flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/50 transition-colors",
        isDraggable ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default",
      )}
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
    >
      {isDraggable && (
        <GripVertical
          className={cn(
            "flex-shrink-0 w-3 h-3 text-muted-foreground/50 transition-opacity duration-100 pointer-events-none",
            isDragging ? "opacity-100" : "opacity-0 group-hover/queue-row:opacity-60",
          )}
          aria-hidden="true"
        />
      )}
      {item.message ? (
        <span className="truncate flex-1 text-foreground">
          <RenderFileMentions text={item.message} />
        </span>
      ) : attachmentParts.length > 0 ? (
        <span className="truncate flex-1 text-muted-foreground italic">
          Using {attachmentParts.join(", ")}
        </span>
      ) : null}
      {attachmentParts.length > 0 && (
        <span className="flex-shrink-0 text-muted-foreground text-[10px]">
          +{attachmentParts.join(", ")}
        </span>
      )}
      <div className="flex items-center gap-1">
        {onSendNow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSendNow}
                className="flex-shrink-0 p-1 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground transition-all"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Send now</TooltipContent>
          </Tooltip>
        )}
        {onRemove && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleRemove}
                className="flex-shrink-0 p-1 hover:bg-foreground/10 rounded text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">Remove</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
})

interface AgentQueueIndicatorProps {
  queue: AgentQueueItem[]
  onRemoveItem?: (itemId: string) => void
  onSendNow?: (itemId: string) => void
  onReorder?: (fromIndex: number, toIndex: number) => void
  isStreaming?: boolean
  /** Whether there's a status card below this one - affects border radius */
  hasStatusCardBelow?: boolean
}

export const AgentQueueIndicator = memo(function AgentQueueIndicator({
  queue,
  onRemoveItem,
  onSendNow,
  onReorder,
  isStreaming = false,
  hasStatusCardBelow = false,
}: AgentQueueIndicatorProps) {
  // 4px activation distance mirrors sidebar/tab DnD so clicks on Send/Remove
  // still pass through as clicks, not as drags.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  const sortableIds = useMemo(() => queue.map((q) => q.id), [queue])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id || !onReorder) return
      const fromIndex = queue.findIndex((q) => q.id === active.id)
      const toIndex = queue.findIndex((q) => q.id === over.id)
      if (fromIndex < 0 || toIndex < 0) return
      onReorder(fromIndex, toIndex)
    },
    [queue, onReorder],
  )
  // Load expanded state from localStorage (window-scoped)
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return true
    const saved = localStorage.getItem(getQueueExpandedKey())
    return saved !== null ? saved === "true" : true // Default to expanded
  })

  // Save expanded state to localStorage (window-scoped)
  useEffect(() => {
    localStorage.setItem(getQueueExpandedKey(), String(isExpanded))
  }, [isExpanded])

  if (queue.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "border border-border bg-muted/30 overflow-hidden flex flex-col rounded-t-xl",
        // If status card below - no bottom border/radius, no padding
        // If no status card - need pb-6 for input overlap
        hasStatusCardBelow ? "border-b-0" : "border-b-0 pb-6"
      )}
    >
      {/* Header - at top */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded(!isExpanded)
          }
        }}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "Collapse" : "Expand"} queue`}
        className="flex items-center justify-between pr-1 pl-3 h-8 cursor-pointer hover:bg-muted/50 transition-colors duration-150 focus:outline-none rounded-sm"
      >
        <div className="flex items-center gap-2 text-xs flex-1 min-w-0">
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200",
              !isExpanded && "-rotate-90"
            )}
          />
          <span className="text-xs text-muted-foreground">
            {queue.length} in queue
          </span>
        </div>

      </div>

      {/* Expanded content - queue items */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border max-h-[200px] overflow-y-auto">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortableIds}
                  strategy={verticalListSortingStrategy}
                >
                  {queue.map((item) => (
                    <QueueItemRow
                      key={item.id}
                      item={item}
                      onRemove={onRemoveItem}
                      onSendNow={onSendNow}
                      isReorderable={!!onReorder}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
