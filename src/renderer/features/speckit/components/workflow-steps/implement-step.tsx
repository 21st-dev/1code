/**
 * ImplementStep Component
 *
 * Final workflow step showing task list with copy buttons.
 * Users can copy task references to use in new chat sessions.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useMemo, useCallback, useState } from "react"
import { Check, Copy, CheckCircle2, Code2, FileCode, Square, CheckSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface ParsedTask {
  /** Task ID (e.g., "T001") */
  id: string
  /** Task description */
  description: string
  /** Whether task is marked complete */
  isComplete: boolean
  /** Whether task can run in parallel [P] */
  isParallel: boolean
  /** Associated user story */
  userStory?: string
  /** File paths mentioned */
  filePaths: string[]
  /** Phase this task belongs to */
  phase?: string
}

interface ImplementStepProps {
  /** Raw tasks.md content */
  tasksContent: string
  /** Feature branch name */
  featureBranch: string
  /** Callback when user wants to start implementation */
  onStartImplementation?: (taskId: string) => void
}

/**
 * Parse tasks.md content into structured task list
 */
function parseTasksContent(content: string): { tasks: ParsedTask[]; phases: string[] } {
  const tasks: ParsedTask[] = []
  const phases: string[] = []
  let currentPhase: string | undefined

  const lines = content.split("\n")

  for (const line of lines) {
    // Match phase headers (e.g., "## Phase 4: User Story 4")
    const phaseMatch = line.match(/^##\s+Phase\s+\d+[:\s]+(.+)$/i)
    if (phaseMatch) {
      currentPhase = phaseMatch[1].trim()
      if (!phases.includes(currentPhase)) {
        phases.push(currentPhase)
      }
      continue
    }

    // Match task lines (e.g., "- [ ] T066 [P] [US4] Description...")
    const taskMatch = line.match(
      /^-\s+\[([ xX])\]\s+(T\d+(?:\.\d+)?)\s*(\[P\])?\s*(\[US\d+\])?\s+(.+)$/
    )
    if (taskMatch) {
      const [, checkmark, id, parallel, userStory, description] = taskMatch
      const isComplete = checkmark.toLowerCase() === "x"
      const isParallel = !!parallel

      // Extract file paths from description
      const filePathMatches = description.match(/(?:src|submodules|specs)\/[^\s,]+/g)
      const filePaths = filePathMatches || []

      tasks.push({
        id,
        description: description.trim(),
        isComplete,
        isParallel,
        userStory: userStory?.replace(/[\[\]]/g, ""),
        filePaths,
        phase: currentPhase,
      })
    }
  }

  return { tasks, phases }
}

/**
 * ImplementStep - Task list with copy functionality
 */
export const ImplementStep = memo(function ImplementStep({
  tasksContent,
  featureBranch,
  onStartImplementation,
}: ImplementStepProps) {
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)

  const { tasks, phases } = useMemo(() => parseTasksContent(tasksContent), [tasksContent])

  // Group tasks by phase
  const tasksByPhase = useMemo(() => {
    const grouped: Record<string, ParsedTask[]> = {}
    for (const task of tasks) {
      const phase = task.phase || "Other"
      if (!grouped[phase]) {
        grouped[phase] = []
      }
      grouped[phase].push(task)
    }
    return grouped
  }, [tasks])

  // Stats
  const completedCount = tasks.filter((t) => t.isComplete).length
  const totalCount = tasks.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const handleCopyTask = useCallback(async (task: ParsedTask) => {
    const taskRef = `${task.id}: ${task.description}`

    try {
      await navigator.clipboard.writeText(taskRef)
      setCopiedTaskId(task.id)
      toast.success("Task reference copied", {
        description: `Use "/speckit.implement ${task.id}" in a new chat`,
      })

      setTimeout(() => setCopiedTaskId(null), 2000)
    } catch {
      toast.error("Failed to copy task reference")
    }
  }, [])

  const handleStartTask = useCallback(
    (task: ParsedTask) => {
      onStartImplementation?.(task.id)
    },
    [onStartImplementation]
  )

  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Implementation Tasks</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{completedCount}/{totalCount} complete</span>
            <span className="text-xs">({progressPercent}%)</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <p className="text-sm text-muted-foreground mt-3">
          Click the copy button to copy a task reference. Start a new chat and use{" "}
          <code className="px-1 py-0.5 bg-muted rounded text-xs">/speckit.implement [task-id]</code>{" "}
          to implement a specific task.
        </p>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-2">
        {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => (
          <div key={phase}>
            {/* Phase Header */}
            <div className="flex items-center gap-2 mb-3 sticky top-0 bg-background py-1">
              <h3 className="text-sm font-medium text-muted-foreground">{phase}</h3>
              <span className="text-xs text-muted-foreground/70">
                ({phaseTasks.filter((t) => t.isComplete).length}/{phaseTasks.length})
              </span>
            </div>

            {/* Tasks */}
            <div className="space-y-2">
              {phaseTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  isCopied={copiedTaskId === task.id}
                  onCopy={() => handleCopyTask(task)}
                  onStart={() => handleStartTask(task)}
                />
              ))}
            </div>
          </div>
        ))}

        {tasks.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <FileCode className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No tasks found in tasks.md</p>
            </div>
          </div>
        )}
      </div>

      {/* Completion Message */}
      {progressPercent === 100 && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/20 border border-green-500/30 rounded-lg flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              All tasks complete!
            </p>
            <p className="text-xs text-green-600 dark:text-green-500">
              The feature implementation is ready for review and testing.
            </p>
          </div>
        </div>
      )}
    </div>
  )
})

ImplementStep.displayName = "ImplementStep"

/**
 * Individual task item component
 */
const TaskItem = memo(function TaskItem({
  task,
  isCopied,
  onCopy,
  onStart,
}: {
  task: ParsedTask
  isCopied: boolean
  onCopy: () => void
  onStart: () => void
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        task.isComplete
          ? "bg-muted/30 border-muted"
          : "bg-background border-border hover:border-primary/30"
      )}
    >
      {/* Checkbox indicator */}
      <div className="mt-0.5 flex-shrink-0">
        {task.isComplete ? (
          <CheckSquare className="h-4 w-4 text-green-500" />
        ) : (
          <Square className="h-4 w-4 text-muted-foreground" />
        )}
      </div>

      {/* Task content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={cn(
              "font-mono text-xs px-1.5 py-0.5 rounded",
              task.isComplete
                ? "bg-green-500/20 text-green-700 dark:text-green-400"
                : "bg-primary/10 text-primary"
            )}
          >
            {task.id}
          </span>
          {task.isParallel && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-400">
              Parallel
            </span>
          )}
          {task.userStory && (
            <span className="text-xs text-muted-foreground">{task.userStory}</span>
          )}
        </div>
        <p
          className={cn(
            "text-sm mt-1",
            task.isComplete && "text-muted-foreground line-through"
          )}
        >
          {task.description}
        </p>
        {task.filePaths.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {task.filePaths.slice(0, 2).map((path, i) => (
              <span
                key={i}
                className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
              >
                {path.split("/").slice(-2).join("/")}
              </span>
            ))}
            {task.filePaths.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{task.filePaths.length - 2} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onCopy}
          disabled={isCopied}
        >
          {isCopied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
})

TaskItem.displayName = "TaskItem"
