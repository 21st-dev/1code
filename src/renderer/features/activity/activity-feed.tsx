"use client"

import { useEffect, useMemo, useState } from "react"
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
import { detectCommand } from "../../lib/bash-command-utils"
import { CommandIcon } from "../../lib/command-icons"
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
  FolderSearch,
  ChevronRight,
  ClipboardList,
  LogOut,
} from "lucide-react"

// Exploration tools that can be grouped
const EXPLORE_TOOLS = new Set(["Read", "Grep", "Glob"])

// Minimum count to form a group
const MIN_GROUP_SIZE = 3

// Type for grouped activities in the feed
type ActivityGroup = {
  type: "group"
  id: string // Use first activity's id
  activities: ToolActivity[]
  summary: string
  chatName: string
  createdAt: Date
  hasError: boolean
  hasRunning: boolean
}

type FeedItem = ToolActivity | ActivityGroup

function isActivityGroup(item: FeedItem): item is ActivityGroup {
  return "type" in item && item.type === "group"
}

// Tool icon components for display
function getToolIcon(toolName: string, activity?: ToolActivity) {
  const iconClass = "w-3.5 h-3.5"

  // Special handling for Bash - detect command type
  if (toolName === "Bash" && activity?.input) {
    try {
      const input = JSON.parse(activity.input)
      const detected = detectCommand(input.command || "")
      return <CommandIcon type={detected.type} className={iconClass} size={14} />
    } catch {
      // Fall through to default
    }
  }

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
      return <FolderSearch className={iconClass} />
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
    case "PlanWrite":
      return <ClipboardList className={iconClass} />
    case "ExitPlanMode":
      return <LogOut className={iconClass} />
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
 * Group consecutive exploration tools (Read, Grep, Glob)
 */
function groupActivities(sortedActivities: ToolActivity[]): FeedItem[] {
  const result: FeedItem[] = []
  let currentGroup: ToolActivity[] = []

  const flushGroup = () => {
    if (currentGroup.length >= MIN_GROUP_SIZE) {
      // Create a group
      const hasError = currentGroup.some((a) => a.state === "error")
      const hasRunning = currentGroup.some((a) => a.state === "running")
      result.push({
        type: "group",
        id: currentGroup[0].id,
        activities: currentGroup,
        summary: `Explored ${currentGroup.length} files`,
        chatName: currentGroup[0].chatName,
        createdAt: currentGroup[0].createdAt,
        hasError,
        hasRunning,
      })
    } else {
      // Not enough to group, add individually
      for (const activity of currentGroup) {
        result.push(activity)
      }
    }
    currentGroup = []
  }

  for (const activity of sortedActivities) {
    // Pinned items never get grouped
    if (activity.isPinned) {
      flushGroup()
      result.push(activity)
      continue
    }

    if (EXPLORE_TOOLS.has(activity.toolName)) {
      // Check if this belongs to the same session (within 5 minutes and same chat)
      const lastInGroup = currentGroup[currentGroup.length - 1]
      const timeDiff = lastInGroup
        ? Math.abs(activity.createdAt.getTime() - lastInGroup.createdAt.getTime())
        : 0
      const sameChat = lastInGroup ? activity.chatName === lastInGroup.chatName : true

      if (currentGroup.length === 0 || (timeDiff < 5 * 60 * 1000 && sameChat)) {
        currentGroup.push(activity)
      } else {
        // Different session, flush and start new group
        flushGroup()
        currentGroup.push(activity)
      }
    } else {
      // Non-explore tool, flush any current group and add this one
      flushGroup()
      result.push(activity)
    }
  }

  // Flush remaining
  flushGroup()

  return result
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
        <div className="text-muted-foreground">{getToolIcon(activity.toolName, activity)}</div>
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
 * Grouped activity item in the feed
 */
function GroupedActivityItem({
  group,
  onClick,
}: {
  group: ActivityGroup
  onClick: () => void
}) {
  return (
    <div
      className="px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors group cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <div className="text-muted-foreground">
          <FolderSearch className="w-3.5 h-3.5" />
        </div>
        <span className="font-medium text-sm truncate flex-1">
          Exploring
        </span>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {group.activities.length}
        </span>
        {group.hasRunning && (
          <LoadingDot isLoading={true} className="w-2.5 h-2.5 text-primary" />
        )}
        {group.hasError && !group.hasRunning && (
          <span className="text-destructive text-xs font-medium">Error</span>
        )}
        {!group.hasError && !group.hasRunning && (
          <span className="text-muted-foreground text-xs">✓</span>
        )}
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <div className="text-xs text-muted-foreground truncate mt-0.5 pl-6">
        {group.summary}
      </div>
      <div className="text-[10px] text-muted-foreground/70 mt-0.5 pl-6 flex items-center gap-1">
        <span className="truncate max-w-[100px]">{group.chatName}</span>
        <span>•</span>
        <span>{formatRelativeTime(group.createdAt)}</span>
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

  // State for grouped selection (when clicking a group)
  const [selectedGroupActivities, setSelectedGroupActivities] = useState<ToolActivity[] | undefined>()

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

  // Group consecutive exploration tools
  const feedItems = groupActivities(sortedActivities)

  // Count running activities
  const runningCount = activities.filter((a) => a.state === "running").length

  return (
    <>
      <div
        className={cn(
          "h-full overflow-hidden flex flex-col",
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
          {feedItems.length > 0 ? (
            feedItems.map((item) => {
              if (isActivityGroup(item)) {
                return (
                  <GroupedActivityItem
                    key={item.id}
                    group={item}
                    onClick={() => {
                      setSelectedActivityId(item.activities[0].id)
                      setSelectedGroupActivities(item.activities)
                    }}
                  />
                )
              }
              return (
                <ActivityItem
                  key={item.id}
                  activity={item}
                  onClick={() => {
                    setSelectedActivityId(item.id)
                    setSelectedGroupActivities(undefined)
                  }}
                  onTogglePin={(e) => handleTogglePin(item, e)}
                />
              )
            })
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
        activities={selectedGroupActivities}
        open={!!selectedActivityId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedActivityId(null)
            setSelectedGroupActivities(undefined)
          }
        }}
      />
    </>
  )
}
