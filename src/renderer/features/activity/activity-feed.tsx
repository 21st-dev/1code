"use client"

import { useEffect, useMemo } from "react"
import { useAtomValue, useSetAtom } from "jotai"
import {
  activityFeedEnabledAtom,
  toolActivityAtom,
  clearToolActivityAtom,
  setToolActivitiesAtom,
  selectedActivityIdAtom,
  toggleActivityPinAtom,
  type ToolActivity,
} from "../../lib/atoms"
import { LoadingDot } from "../../icons"
import { Button } from "../../components/ui/button"
import { cn } from "../../lib/utils"
import { trpcClient } from "../../lib/trpc"
import { ActivityViewerModal } from "./activity-viewer-modal"
import { useAgentSubChatStore } from "../agents/stores/sub-chat-store"
import {
  FileText,
  FilePen,
  Terminal,
  Search,
  Globe,
  Bot,
  ListTodo,
  HelpCircle,
  FileCode,
  Wrench,
  Pin,
} from "lucide-react"

// Tool icon components for display
function getToolIcon(toolName: string) {
  const iconClass = "w-3.5 h-3.5"
  switch (toolName) {
    case "Read":
      return <FileText className={iconClass} />
    case "Write":
      return <FilePen className={iconClass} />
    case "Edit":
      return <FilePen className={iconClass} />
    case "Bash":
      return <Terminal className={iconClass} />
    case "Glob":
    case "Grep":
      return <Search className={iconClass} />
    case "WebFetch":
    case "WebSearch":
      return <Globe className={iconClass} />
    case "Task":
      return <Bot className={iconClass} />
    case "TodoWrite":
      return <ListTodo className={iconClass} />
    case "AskUserQuestion":
      return <HelpCircle className={iconClass} />
    case "NotebookEdit":
      return <FileCode className={iconClass} />
    default:
      return <Wrench className={iconClass} />
  }
}

/**
 * Format relative time (e.g., "2s ago", "1m ago")
 */
function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 5) return "now"
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  return `${Math.floor(hours / 24)}d ago`
}

/**
 * Single activity item in the feed
 */
function ActivityItem({
  activity,
  onClick,
  onTogglePin,
}: {
  activity: ToolActivity
  onClick: () => void
  onTogglePin: (e: React.MouseEvent) => void
}) {
  return (
    <div
      className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors group cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground">{getToolIcon(activity.toolName)}</div>
        <span className="font-medium text-sm truncate flex-1">
          {activity.toolName}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
            activity.isPinned && "opacity-100",
          )}
          onClick={onTogglePin}
        >
          <Pin
            className={cn(
              "w-3 h-3",
              activity.isPinned && "fill-current text-primary",
            )}
          />
        </Button>
        {activity.state === "running" && (
          <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-primary" />
        )}
        {activity.state === "error" && (
          <span className="text-destructive text-xs font-medium">Error</span>
        )}
        {activity.state === "complete" && (
          <span className="text-muted-foreground text-xs">✓</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5 pl-6">
        {activity.summary}
      </div>
      <div className="text-[10px] text-muted-foreground/70 mt-0.5 pl-6 flex items-center gap-1">
        <span className="truncate max-w-[100px]">{activity.chatName}</span>
        <span>•</span>
        <span>{formatRelativeTime(activity.createdAt)}</span>
      </div>
    </div>
  )
}

/**
 * Activity Feed Panel
 * Shows real-time tool execution history
 */
export function ActivityFeed({ className }: { className?: string }) {
  const allActivities = useAtomValue(toolActivityAtom)
  const enabled = useAtomValue(activityFeedEnabledAtom)
  const clearActivities = useSetAtom(clearToolActivityAtom)
  const setActivities = useSetAtom(setToolActivitiesAtom)
  const setSelectedActivityId = useSetAtom(selectedActivityIdAtom)
  const selectedActivityId = useAtomValue(selectedActivityIdAtom)
  const togglePin = useSetAtom(toggleActivityPinAtom)

  // Get current chat's sub-chat IDs to filter activities
  const allSubChats = useAgentSubChatStore((s) => s.allSubChats)
  const currentSubChatIds = useMemo(
    () => new Set(allSubChats.map((sc) => sc.id)),
    [allSubChats],
  )

  // Filter activities to only show those from the current chat's sub-chats
  const activities = useMemo(
    () => allActivities.filter((a) => currentSubChatIds.has(a.subChatId)),
    [allActivities, currentSubChatIds],
  )

  // Load activities from database on mount
  useEffect(() => {
    const loadActivities = async () => {
      try {
        const dbActivities = await trpcClient.activities.getRecent.query({
          limit: 100,
        })
        // Map DB activities to ToolActivity interface
        const mapped: ToolActivity[] = dbActivities.map((a) => ({
          id: a.id,
          subChatId: a.subChatId,
          chatName: a.chatName,
          toolName: a.toolName,
          summary: a.summary,
          state: a.state as ToolActivity["state"],
          input: a.input,
          output: a.output,
          errorText: a.errorText,
          isPinned: a.isPinned,
          createdAt: a.createdAt ?? new Date(),
        }))
        setActivities(mapped)
      } catch (err) {
        console.error("[ACTIVITY_FEED] Failed to load activities:", err)
      }
    }
    loadActivities()
  }, [setActivities])

  // Handle toggle pin
  const handleTogglePin = async (activity: ToolActivity, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent opening modal
    const newPinnedState = !activity.isPinned

    // Optimistic update
    togglePin({ id: activity.id, isPinned: newPinnedState })

    // Persist to DB
    try {
      await trpcClient.activities.togglePin.mutate({
        id: activity.id,
        isPinned: newPinnedState,
      })
    } catch (err) {
      console.error("[ACTIVITY_FEED] Failed to toggle pin:", err)
      // Revert optimistic update on error
      togglePin({ id: activity.id, isPinned: activity.isPinned })
    }
  }

  // Handle clear - also clears from DB
  const handleClear = async () => {
    try {
      await trpcClient.activities.clear.mutate()
      clearActivities()
    } catch (err) {
      console.error("[ACTIVITY_FEED] Failed to clear activities:", err)
    }
  }

  // Get selected activity for modal
  const selectedActivity = selectedActivityId
    ? activities.find((a) => a.id === selectedActivityId)
    : null

  if (!enabled) return null

  // Sort: pinned items first, then by createdAt desc
  const sortedActivities = [...activities].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1
    if (!a.isPinned && b.isPinned) return 1
    return b.createdAt.getTime() - a.createdAt.getTime()
  })

  // Count running activities
  const runningCount = activities.filter((a) => a.state === "running").length

  return (
    <>
      <div
        className={cn(
          "w-56 border-l border-border/50 bg-background h-full overflow-hidden flex flex-col",
          className,
        )}
      >
        {/* Header */}
        <div className="px-3 py-2 border-b border-border/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-sm">Activity</h3>
            {runningCount > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                {runningCount}
              </span>
            )}
          </div>
          {activities.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleClear}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Activity list */}
        <div className="flex-1 overflow-y-auto">
          {sortedActivities.length > 0 ? (
            sortedActivities.map((activity) => (
              <ActivityItem
                key={activity.id}
                activity={activity}
                onClick={() => setSelectedActivityId(activity.id)}
                onTogglePin={(e) => handleTogglePin(activity, e)}
              />
            ))
          ) : (
            <div className="p-4 text-muted-foreground text-sm text-center">
              No recent activity
            </div>
          )}
        </div>
      </div>

      {/* Viewer Modal */}
      <ActivityViewerModal
        activity={selectedActivity ?? null}
        open={!!selectedActivityId}
        onOpenChange={(open) => {
          if (!open) setSelectedActivityId(null)
        }}
      />
    </>
  )
}
