import { memo, useState, useMemo, useEffect } from "react"
import { useAtom } from "jotai"
import { TextShimmer } from "../../components/ui/text-shimmer"
import {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
  CheckIcon,
  PlanIcon,
  IconDoubleChevronRight,
  IconArrowRight,
} from "../../icons"
import { getToolStatus } from "./agent-tool-registry"
import { cn } from "../../lib/utils"
import { Circle } from "lucide-react"
import { AgentToolCall } from "./agent-tool-call"
import { currentTodosAtomFamily } from "../../lib/atoms"

interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

interface AgentTodoToolProps {
  part: {
    type: string
    toolCallId: string
    state?: string
    input?: {
      todos?: TodoItem[]
    }
    output?: {
      oldTodos?: TodoItem[]
      newTodos?: TodoItem[]
    }
  }
  chatStatus?: string
  subChatId?: string // Required for syncing todos across tool calls
}

interface TodoChange {
  todo: TodoItem
  oldStatus?: TodoItem["status"]
  newStatus: TodoItem["status"]
  index: number
}

type ChangeType = "creation" | "single" | "multiple"

interface DetectedChanges {
  type: ChangeType
  items: TodoChange[]
}

// Detect what changed between old and new todos
function detectChanges(
  oldTodos: TodoItem[],
  newTodos: TodoItem[],
): DetectedChanges {
  // If no old todos, this is a creation - show full list ONCE
  if (!oldTodos || oldTodos.length === 0) {
    return {
      type: "creation",
      items: newTodos.map((todo, index) => ({
        todo,
        newStatus: todo.status,
        index,
      })),
    }
  }

  // Find what changed
  const changes: TodoChange[] = []
  newTodos.forEach((newTodo, index) => {
    const oldTodo = oldTodos[index]
    if (!oldTodo || oldTodo.status !== newTodo.status) {
      changes.push({
        todo: newTodo,
        oldStatus: oldTodo?.status,
        newStatus: newTodo.status,
        index,
      })
    }
  })

  // Single change - show compact mode
  if (changes.length === 1) {
    return { type: "single", items: changes }
  }

  // Multiple changes - also show compact mode (not full list)
  // User can always expand the creation tool to see full plan
  return { type: "multiple", items: changes }
}

// Get status verb for compact display
function getStatusVerb(status: TodoItem["status"], content: string): string {
  switch (status) {
    case "in_progress":
      return `Started: ${content}`
    case "completed":
      return `Finished: ${content}`
    case "pending":
      return `Created: ${content}`
    default:
      return content
  }
}

// Get icon component for status
function getStatusIconComponent(status: TodoItem["status"]) {
  switch (status) {
    case "completed":
      return CheckIcon
    case "in_progress":
      return IconSpinner
    default:
      return Circle
  }
}

const TodoStatusIcon = ({
  status,
  isPending,
}: {
  status: TodoItem["status"]
  isPending?: boolean
}) => {
  // During loading, show arrow for in_progress items with foreground background
  if (isPending && status === "in_progress") {
    return (
      <div className="w-3.5 h-3.5 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
        <IconArrowRight className="w-2 h-2 text-background" />
      </div>
    )
  }

  switch (status) {
    case "completed":
      return (
        <div
          className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--border))" }}
        >
          <CheckIcon className="w-2 h-2 text-muted-foreground" />
        </div>
      )
    case "in_progress":
      return (
        <div className="w-3.5 h-3.5 rounded-full bg-foreground flex items-center justify-center flex-shrink-0">
          <IconArrowRight className="w-2 h-2 text-background" />
        </div>
      )
    default:
      return (
        <div
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: "0.5px solid hsl(var(--muted-foreground) / 0.3)" }}
        />
      )
  }
}

export const AgentTodoTool = memo(function AgentTodoTool({
  part,
  chatStatus,
  subChatId,
}: AgentTodoToolProps) {
  // Synced todos state - scoped per subChatId to prevent cross-chat conflicts
  // Uses a stable key to ensure proper isolation between different sub-chats
  const todosAtom = useMemo(
    () => currentTodosAtomFamily(subChatId || "default"),
    [subChatId],
  )
  const [syncedTodos, setSyncedTodos] = useAtom(todosAtom)

  // Get todos from input or output.newTodos
  const oldTodos = part.output?.oldTodos || []
  const newTodos = part.input?.todos || part.output?.newTodos || []

  // Detect what changed - memoize to avoid recalculation
  const changes = useMemo(
    () => detectChanges(oldTodos, newTodos),
    [oldTodos, newTodos],
  )

  // State for expanded/collapsed
  const [isExpanded, setIsExpanded] = useState(false)
  const { isPending } = getToolStatus(part, chatStatus)

  // Update synced todos whenever newTodos change
  // This keeps the creation tool in sync with all updates
  useEffect(() => {
    if (newTodos.length > 0) {
      setSyncedTodos({
        todos: newTodos,
        creationToolCallId: syncedTodos.creationToolCallId ?? part.toolCallId,
      })
    }
  }, [newTodos, setSyncedTodos, syncedTodos.creationToolCallId, part.toolCallId])

  // Auto-expand on creation
  useEffect(() => {
    if (changes.type === "creation") {
      setIsExpanded(true)
    }
  }, [changes.type])

  // Early streaming state - show "Updating to-do list..." with shimmer
  // Only show shimmer when actively streaming (isPending), otherwise show static text
  if (
    newTodos.length === 0 ||
    (part.state === "input-streaming" && !part.input?.todos)
  ) {
    return (
      <div className="flex items-start gap-1.5 py-0.5 rounded-md px-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  Updating to-do list...
                </TextShimmer>
              ) : (
                "Updating to-do list..."
              )}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // COMPACT MODE: Single update - render as simple tool call
  if (changes.type === "single") {
    const change = changes.items[0]
    const IconComponent = getStatusIconComponent(change.newStatus)

    return (
      <AgentToolCall
        icon={IconComponent}
        title={getStatusVerb(change.newStatus, change.todo.content)}
        subtitle={
          change.todo.activeForm && change.newStatus === "in_progress"
            ? change.todo.activeForm
            : undefined
        }
        isPending={isPending}
        isError={false}
      />
    )
  }

  // COMPACT MODE: Multiple updates - render as custom component with icons
  if (changes.type === "multiple") {
    const completedChanges = changes.items.filter(
      (c) => c.newStatus === "completed",
    ).length
    const startedChanges = changes.items.filter(
      (c) => c.newStatus === "in_progress",
    ).length

    // Build summary title
    let summaryTitle = "Updated todos"
    if (completedChanges > 0 && startedChanges === 0) {
      summaryTitle = `Finished ${completedChanges} ${completedChanges === 1 ? "task" : "tasks"}`
    } else if (startedChanges > 0 && completedChanges === 0) {
      summaryTitle = `Started ${startedChanges} ${startedChanges === 1 ? "task" : "tasks"}`
    } else if (completedChanges > 0 && startedChanges > 0) {
      summaryTitle = `Updated ${changes.items.length} ${changes.items.length === 1 ? "task" : "tasks"}`
    }

    // Limit displayed items to avoid overflow
    const MAX_VISIBLE_ITEMS = 3
    const visibleItems = changes.items.slice(0, MAX_VISIBLE_ITEMS)
    const remainingCount = changes.items.length - MAX_VISIBLE_ITEMS

    return (
      <div className="flex items-start gap-1.5 py-0.5 rounded-md px-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 min-w-0">
            <span className="font-medium whitespace-nowrap flex-shrink-0">
              {isPending ? (
                <TextShimmer
                  as="span"
                  duration={1.2}
                  className="inline-flex items-center text-xs leading-none h-4 m-0"
                >
                  {summaryTitle}
                </TextShimmer>
              ) : (
                summaryTitle
              )}
            </span>
            <div className="flex items-center gap-1 text-muted-foreground/60 font-normal truncate min-w-0">
              {visibleItems.map((c, idx) => {
                // Choose icon based on status
                const StatusIcon =
                  c.newStatus === "completed"
                    ? CheckIcon
                    : c.newStatus === "in_progress"
                      ? IconDoubleChevronRight
                      : Circle

                return (
                  <div
                    key={idx}
                    className="flex items-center gap-1 flex-shrink-0"
                  >
                    <StatusIcon className="w-3 h-3" />
                    <span className="truncate">{c.todo.content}</span>
                    {idx < visibleItems.length - 1 && (
                      <span className="mx-0.5">,</span>
                    )}
                  </div>
                )
              })}
              {remainingCount > 0 && (
                <span className="text-muted-foreground/60 whitespace-nowrap flex-shrink-0">
                  +{remainingCount} more
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // FULL MODE: Creation - render as expandable list
  // Use syncedTodos to show the current state (synced with all updates)
  const displayTodos = syncedTodos.todos.length > 0 ? syncedTodos.todos : newTodos
  const completedCount = displayTodos.filter(
    (t: TodoItem) => t.status === "completed",
  ).length
  const totalTodos = displayTodos.length

  // Header title
  const getHeaderTitle = () => {
    if (isPending) {
      return <span>Updating todos...</span>
    }
    return (
      <span>
        To-dos{" "}
        <span className="text-muted-foreground/60">
          {completedCount}/{totalTodos}
        </span>
      </span>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - click anywhere to expand/collapse */}
      <div
        className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors duration-150"
        onClick={() => setIsExpanded(!isExpanded)}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`Todo list with ${totalTodos} items. Click to ${isExpanded ? "collapse" : "expand"}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded(!isExpanded)
          }
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <PlanIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isPending ? (
              <TextShimmer
                as="span"
                duration={1.2}
                className="text-xs font-medium"
              >
                {getHeaderTitle()}
              </TextShimmer>
            ) : (
              <span className="text-xs font-medium text-foreground">
                {getHeaderTitle()}
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {isPending && <IconSpinner className="w-3 h-3" />}

          {/* Expand/Collapse icon */}
          <div className="relative w-4 h-4">
            <ExpandIcon
              className={cn(
                "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
              )}
            />
            <CollapseIcon
              className={cn(
                "absolute inset-0 w-4 h-4 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
              )}
            />
          </div>
        </div>
      </div>

      {/* Expanded content - todo list */}
      {isExpanded && (
        <div className="border-t border-border max-h-[300px] overflow-y-auto">
          {displayTodos.map((todo: TodoItem, idx: number) => (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5",
                idx !== displayTodos.length - 1 && "border-b border-border/30",
              )}
            >
              <TodoStatusIcon status={todo.status} isPending={isPending} />
              <span
                className={cn(
                  "text-xs truncate",
                  todo.status === "completed" &&
                    "line-through text-muted-foreground",
                  todo.status === "pending" && "text-muted-foreground",
                )}
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})
