import { memo } from "react"
import { AgentQueueIndicator } from "../ui/agent-queue-indicator"
import { SubChatStatusCard } from "../ui/sub-chat-status-card"
import type { AgentQueueItem } from "../lib/queue-utils"
import type { SubChatFileChange } from "../atoms"

interface QueueAndStatusCardsProps {
  queue: AgentQueueItem[]
  changedFiles: SubChatFileChange[]
  pendingQuestions: boolean
  chatId: string
  subChatId: string
  isStreaming: boolean
  isCompacting: boolean
  worktreePath?: string
  onStop: () => void
  onRemoveFromQueue: (itemId: string) => void
  onSendFromQueue: (itemId: string) => void
}

/**
 * Component that displays the queue indicator and status cards
 * Shows queue when messages are queued, and status card when files are changed
 */
export const QueueAndStatusCards = memo(function QueueAndStatusCards({
  queue,
  changedFiles,
  pendingQuestions,
  chatId,
  subChatId,
  isStreaming,
  isCompacting,
  worktreePath,
  onStop,
  onRemoveFromQueue,
  onSendFromQueue,
}: QueueAndStatusCardsProps) {
  // Don't render if there are pending questions (they take priority)
  if (pendingQuestions) {
    return null
  }

  // Don't render if there's nothing to show
  if (queue.length === 0 && changedFiles.length === 0) {
    return null
  }

  return (
    <div className="px-2 -mb-6 relative z-10">
      <div className="w-full max-w-2xl mx-auto px-2">
        {/* Queue indicator card - top card */}
        {queue.length > 0 && (
          <AgentQueueIndicator
            queue={queue}
            onRemoveItem={onRemoveFromQueue}
            onSendNow={onSendFromQueue}
            isStreaming={isStreaming}
            hasStatusCardBelow={changedFiles.length > 0}
          />
        )}
        {/* Status card - bottom card, only when there are changed files */}
        {changedFiles.length > 0 && (
          <SubChatStatusCard
            chatId={chatId}
            subChatId={subChatId}
            isStreaming={isStreaming}
            isCompacting={isCompacting}
            changedFiles={changedFiles}
            worktreePath={worktreePath}
            onStop={onStop}
            hasQueueCardAbove={queue.length > 0}
          />
        )}
      </div>
    </div>
  )
})
