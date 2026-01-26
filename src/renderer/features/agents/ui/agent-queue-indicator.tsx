"use client"

import { memo, useState, useCallback, useEffect } from "react"
import { ChevronDown, ArrowUp, X } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../components/ui/tooltip"
import { cn } from "../../../lib/utils"
import type { AgentQueueItem } from "../lib/queue-utils"
import { RenderFileMentions } from "../mentions/render-file-mentions"

const QUEUE_EXPANDED_KEY = "agent-queue-expanded"

// Queue item row component
const QueueItemRow = memo(function QueueItemRow({
  item,
  onRemove,
  onSendNow,
}: {
  item: AgentQueueItem
  onRemove?: (itemId: string) => void
  onSendNow?: (itemId: string) => void
}) {
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

  // Get display text - truncate message and show attachment count
  const hasAttachments =
    (item.images && item.images.length > 0) ||
    (item.files && item.files.length > 0) ||
    (item.textContexts && item.textContexts.length > 0) ||
    (item.diffTextContexts && item.diffTextContexts.length > 0)
  const attachmentCount =
    (item.images?.length || 0) +
    (item.files?.length || 0) +
    (item.textContexts?.length || 0) +
    (item.diffTextContexts?.length || 0)

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/60 active:bg-muted/70 transition-all duration-150 cursor-default rounded-sm">
      <span className="truncate flex-1 text-foreground">
          <RenderFileMentions text={item.message} />
        </span>
      {hasAttachments && (
        <span className="flex-shrink-0 text-muted-foreground text-[10px] px-1.5 py-0.5 bg-muted/50 rounded">
          +{attachmentCount} {attachmentCount === 1 ? "file" : "files"}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        {onSendNow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSendNow}
                className="flex-shrink-0 p-1.5 hover:bg-primary/10 active:bg-primary/20 rounded-md text-muted-foreground hover:text-primary transition-all duration-150 active:scale-[0.95] focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1"
                aria-label="Send now"
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
                className="flex-shrink-0 p-1.5 hover:bg-destructive/10 active:bg-destructive/20 rounded-md text-muted-foreground hover:text-destructive transition-all duration-150 active:scale-[0.95] focus:outline-none focus:ring-2 focus:ring-destructive/50 focus:ring-offset-1"
                aria-label="Remove"
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
  isStreaming?: boolean
  /** Whether there's a status card below this one - affects border radius */
  hasStatusCardBelow?: boolean
}

export const AgentQueueIndicator = memo(function AgentQueueIndicator({
  queue,
  onRemoveItem,
  onSendNow,
  isStreaming = false,
  hasStatusCardBelow = false,
}: AgentQueueIndicatorProps) {
  // Load expanded state from localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === "undefined") return true
    const saved = localStorage.getItem(QUEUE_EXPANDED_KEY)
    return saved !== null ? saved === "true" : true // Default to expanded
  })

  // Save expanded state to localStorage
  useEffect(() => {
    localStorage.setItem(QUEUE_EXPANDED_KEY, String(isExpanded))
  }, [isExpanded])

  if (queue.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "border border-border/60 bg-muted/40 backdrop-blur-sm overflow-hidden flex flex-col rounded-t-xl shadow-sm",
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
        className="flex items-center justify-between pr-1 pl-3 h-8 cursor-pointer hover:bg-muted/60 active:bg-muted/70 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1 rounded-sm"
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
              {queue.map((item) => (
                <QueueItemRow
                  key={item.id}
                  item={item}
                  onRemove={onRemoveItem}
                  onSendNow={onSendNow}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
})
