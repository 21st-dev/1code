"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog"
import { type ToolActivity } from "../../lib/atoms"
import { cn } from "../../lib/utils"
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
  FolderSearch,
  ClipboardList,
  LogOut,
} from "lucide-react"
import {
  BashModalContent,
  EditModalContent,
  WebFetchModalContent,
  WebSearchModalContent,
  ExploreModalContent,
  DefaultModalContent,
  PlanModalContent,
  ExitPlanModalContent,
} from "./tool-modal-content"

// Tool icon components for display
function getToolIcon(toolName: string) {
  const iconClass = "w-5 h-5"
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
 * Get modal size class based on tool type
 * - Large for diff views (Edit, Write)
 * - Medium for terminal/web content (Bash, WebFetch)
 * - Smaller for simple tools
 */
function getModalSizeClass(toolName: string): string {
  switch (toolName) {
    case "Edit":
    case "Write":
      return "max-w-4xl"
    case "Bash":
    case "WebFetch":
    case "WebSearch":
      return "max-w-2xl"
    case "Read":
    case "Grep":
    case "Glob":
      return "max-w-2xl"
    case "PlanWrite":
    case "ExitPlanMode":
      return "max-w-2xl"
    default:
      return "max-w-lg"
  }
}

/**
 * Format timestamp for display
 */
function formatTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

/**
 * Render the appropriate content component based on tool type
 */
function getModalContent(activity: ToolActivity, activities?: ToolActivity[]) {
  switch (activity.toolName) {
    case "Bash":
      return <BashModalContent activity={activity} />
    case "Edit":
    case "Write":
      return <EditModalContent activity={activity} />
    case "WebFetch":
      return <WebFetchModalContent activity={activity} />
    case "WebSearch":
      return <WebSearchModalContent activity={activity} />
    case "Read":
    case "Grep":
    case "Glob":
      return <ExploreModalContent activity={activity} activities={activities} />
    case "PlanWrite":
      return <PlanModalContent activity={activity} />
    case "ExitPlanMode":
      return <ExitPlanModalContent activity={activity} />
    default:
      return <DefaultModalContent activity={activity} />
  }
}

interface ActivityViewerModalProps {
  activity: ToolActivity | null
  // For grouped activities
  activities?: ToolActivity[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ActivityViewerModal({
  activity,
  activities,
  open,
  onOpenChange,
}: ActivityViewerModalProps) {
  if (!activity) return null

  // Determine if this is a grouped view
  const isGrouped = activities && activities.length > 1
  const modalSizeClass = isGrouped ? "max-w-2xl" : getModalSizeClass(activity.toolName)

  // For grouped view, use a combined title
  const title = isGrouped
    ? `Explored ${activities.length} files`
    : activity.toolName

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(modalSizeClass, "max-h-[80vh] overflow-hidden flex flex-col")}>
        <DialogHeader className="pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="text-muted-foreground">
              {isGrouped ? <FolderSearch className="w-5 h-5" /> : getToolIcon(activity.toolName)}
            </div>
            <div className="flex-1">
              <DialogTitle className="flex items-center gap-2">
                {title}
                {!isGrouped && (
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      activity.state === "running" &&
                        "bg-blue-500/10 text-blue-500",
                      activity.state === "complete" &&
                        "bg-green-500/10 text-green-500",
                      activity.state === "error" &&
                        "bg-destructive/10 text-destructive",
                    )}
                  >
                    {activity.state}
                  </span>
                )}
              </DialogTitle>
              <div className="text-sm text-muted-foreground mt-1">
                {activity.chatName} &bull; {formatTimestamp(activity.createdAt)}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {getModalContent(activity, activities)}
        </div>
      </DialogContent>
    </Dialog>
  )
}
