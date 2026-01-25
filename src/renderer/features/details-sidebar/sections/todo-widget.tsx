"use client"

import { memo, useMemo, useState, useCallback } from "react"
import { useAtomValue } from "jotai"
import { cn } from "@/lib/utils"
import { PlanIcon, CheckIcon, IconArrowRight, ExpandIcon, CollapseIcon } from "@/components/ui/icons"
import { currentTodosAtomFamily } from "@/features/agents/atoms"

interface TodoItem {
  content: string
  status: "pending" | "in_progress" | "completed"
  activeForm?: string
}

interface TodoWidgetProps {
  /** Active sub-chat ID to get todos from */
  subChatId: string | null
}

// Pie-style progress circle - fills sectors like pizza slices
const ProgressCircle = ({
  completed,
  total,
  size = 16,
  className,
}: {
  completed: number
  total: number
  size?: number
  className?: string
}) => {
  const cx = size / 2
  const cy = size / 2
  const outerRadius = (size - 1) / 2
  const innerRadius = outerRadius - 1.5 // Leave space for outer border

  // Create pie segments (no borders on segments, just fill)
  const segments = []
  for (let i = 0; i < total; i++) {
    const startAngle = (i / total) * 360 - 90 // Start from top
    const endAngle = ((i + 1) / total) * 360 - 90
    const gap = total > 1 ? 4 : 0 // Gap between segments
    const adjustedStartAngle = startAngle + gap / 2
    const adjustedEndAngle = endAngle - gap / 2

    // Convert to radians
    const startRad = (adjustedStartAngle * Math.PI) / 180
    const endRad = (adjustedEndAngle * Math.PI) / 180

    // Calculate arc points
    const x1 = cx + innerRadius * Math.cos(startRad)
    const y1 = cy + innerRadius * Math.sin(startRad)
    const x2 = cx + innerRadius * Math.cos(endRad)
    const y2 = cy + innerRadius * Math.sin(endRad)

    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
    const pathData = `M ${cx} ${cy} L ${x1} ${y1} A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`

    segments.push(
      <path
        key={i}
        d={pathData}
        fill={i < completed ? "currentColor" : "transparent"}
        opacity={i < completed ? 0.7 : 0.15}
      />,
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("text-muted-foreground", className)}
    >
      {/* Outer border circle */}
      <circle
        cx={cx}
        cy={cy}
        r={outerRadius}
        fill="none"
        stroke="currentColor"
        strokeWidth={0.5}
        opacity={0.3}
      />
      {segments}
    </svg>
  )
}

const TodoStatusIcon = ({
  status,
}: {
  status: TodoItem["status"]
}) => {
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

const TodoListItem = ({
  todo,
  isLast,
}: {
  todo: TodoItem
  isLast: boolean
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5",
        !isLast && "border-b border-border/30",
      )}
    >
      <TodoStatusIcon status={todo.status} />
      <span
        className={cn(
          "text-xs truncate",
          todo.status === "completed"
            ? "line-through text-muted-foreground"
            : todo.status === "pending"
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {todo.status === "in_progress" && todo.activeForm
          ? todo.activeForm
          : todo.content}
      </span>
    </div>
  )
}

/**
 * To-do list Widget for Overview Sidebar
 * Shows active todos from selected sub-chat
 * Matches the visual style of AgentTodoTool exactly
 * Memoized to prevent re-renders when parent updates
 */
export const TodoWidget = memo(function TodoWidget({ subChatId }: TodoWidgetProps) {
  // Get todos from the active sub-chat
  const todosAtom = useMemo(
    () => currentTodosAtomFamily(subChatId || "default"),
    [subChatId],
  )
  const todoState = useAtomValue(todosAtom)
  const todos = todoState.todos

  // Expanded/collapsed state
  const [isExpanded, setIsExpanded] = useState(true)

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setIsExpanded((prev) => !prev)
    }
  }, [])

  // Calculate stats
  const completedCount = todos.filter((t) => t.status === "completed").length
  const inProgressCount = todos.filter((t) => t.status === "in_progress").length
  const totalTodos = todos.length

  // For visual progress, count completed + in_progress tasks
  const visualProgress = completedCount + inProgressCount

  // Find current task (first in_progress, or first pending if none in progress)
  const currentTask =
    todos.find((t) => t.status === "in_progress") ||
    todos.find((t) => t.status === "pending")

  // Find current task index for progress display
  const currentTaskIndex = currentTask
    ? todos.findIndex((t) => t === currentTask) + 1
    : completedCount

  // Don't render if no todos
  if (todos.length === 0) {
    return null
  }

  return (
    <div className="mx-2 mb-2">
      {/* TOP BLOCK - Header with expand/collapse button - fixed height h-8 for consistency */}
      <div
        className="rounded-t-lg border border-b-0 border-border/50 bg-muted/30 px-2 h-8 cursor-pointer hover:bg-muted/50 transition-colors duration-150 flex items-center"
        onClick={handleToggleExpand}
        role="button"
        aria-expanded={isExpanded}
        aria-label={`To-do list with ${totalTodos} items. Click to ${isExpanded ? "collapse" : "expand"}`}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PlanIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground">To-dos</span>
          <span className="text-xs text-muted-foreground truncate flex-1">
            {todos[0]?.content || "To-do list"}
          </span>
          {/* Expand/Collapse icon */}
          <div className="relative w-3.5 h-3.5 flex-shrink-0">
            <ExpandIcon
              className={cn(
                "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-0 scale-75" : "opacity-100 scale-100",
              )}
            />
            <CollapseIcon
              className={cn(
                "absolute inset-0 w-3.5 h-3.5 text-muted-foreground transition-[opacity,transform] duration-200 ease-out",
                isExpanded ? "opacity-100 scale-100" : "opacity-0 scale-75",
              )}
            />
          </div>
        </div>
      </div>

      {/* BOTTOM BLOCK - Current task + progress (expandable) */}
      <div className="rounded-b-lg border border-border/50 border-t-0">
        {/* Collapsed view - progress circle + current task + count */}
        {!isExpanded && (
          <div
            className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors duration-150"
            onClick={() => setIsExpanded(true)}
          >
            {/* Progress circle or checkmark when all completed */}
            {completedCount === totalTodos && totalTodos > 0 ? (
              <div
                className="w-4 h-4 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
                style={{ border: "0.5px solid hsl(var(--border))" }}
              >
                <CheckIcon className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
            ) : (
              <ProgressCircle
                completed={visualProgress}
                total={totalTodos}
                size={16}
                className="flex-shrink-0"
              />
            )}

            {/* Current task name */}
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {currentTask && (
                <span className="text-xs text-muted-foreground truncate">
                  {currentTask.status === "in_progress"
                    ? currentTask.activeForm || currentTask.content
                    : currentTask.content}
                </span>
              )}
              {!currentTask && completedCount === totalTodos && totalTodos > 0 && (
                <span className="text-xs text-muted-foreground truncate">
                  {todos[totalTodos - 1]?.content}
                </span>
              )}
            </div>

            {/* Right side - task count */}
            <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
              {currentTaskIndex}/{totalTodos}
            </span>
          </div>
        )}

        {/* Expanded content - full todo list */}
        {isExpanded && (
          <div
            className="max-h-[300px] overflow-y-auto scrollbar-thin cursor-pointer"
            onClick={() => setIsExpanded(false)}
          >
            {todos.map((todo, idx) => (
              <TodoListItem
                key={idx}
                todo={todo}
                isLast={idx === todos.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
