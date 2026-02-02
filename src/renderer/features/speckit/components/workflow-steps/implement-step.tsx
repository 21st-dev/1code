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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { PhaseSection } from "../phase-section"
import { trpc } from "@/lib/trpc"

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
  /** Phase number */
  phaseNumber?: string
}

interface PhaseInfo {
  /** Phase number (e.g., "0", "1", "2") */
  number: string
  /** Phase title (e.g., "Submodule Relocation (Infrastructure)") */
  title: string
}

interface ImplementStepProps {
  /** Raw tasks.md content */
  tasksContent: string
  /** Feature branch name */
  featureBranch: string
  /** Project path for fetching branch info */
  projectPath: string
  /** Callback when user wants to start implementation */
  onStartImplementation?: (taskId: string) => void
}

/**
 * Parse tasks.md content into structured task list
 */
function parseTasksContent(content: string): { tasks: ParsedTask[]; phaseInfoMap: Map<string, PhaseInfo> } {
  const tasks: ParsedTask[] = []
  const phaseInfoMap = new Map<string, PhaseInfo>()
  let currentPhase: string | undefined
  let currentPhaseNumber: string | undefined

  const lines = content.split("\n")

  for (const line of lines) {
    // Match phase headers (e.g., "## Phase 4: User Story 4" or "## Phase 0: Submodule Relocation")
    const phaseMatch = line.match(/^##\s+Phase\s+(\d+)[:\s]+(.+)$/i)
    if (phaseMatch) {
      const phaseNumber = phaseMatch[1]
      const phaseTitle = phaseMatch[2].trim()
      currentPhase = phaseTitle
      currentPhaseNumber = phaseNumber

      if (!phaseInfoMap.has(phaseTitle)) {
        phaseInfoMap.set(phaseTitle, {
          number: phaseNumber,
          title: phaseTitle,
        })
      }
      continue
    }

    // Match task lines (e.g., "- [ ] T066 [P] [US4] Description..." or "- [X] T001 ...")
    const taskMatch = line.match(
      /^-\s+\[([ xX])\]\s+(T\d+(?:\.\d+)?)\s*(\[P\])?\s*(\[V2\])?\s*(\[US\d+\])?\s+(.+)$/
    )
    if (taskMatch) {
      const [, checkmark, id, parallel, , userStory, description] = taskMatch
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
        phaseNumber: currentPhaseNumber,
      })
    }
  }

  return { tasks, phaseInfoMap }
}

/**
 * ImplementStep - Task list with copy functionality
 */
export const ImplementStep = memo(function ImplementStep({
  tasksContent,
  featureBranch,
  projectPath,
  onStartImplementation,
}: ImplementStepProps) {
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)

  // Get current branch name
  const { data: branchData } = trpc.speckit.getCurrentBranch.useQuery(
    { projectPath },
    { enabled: !!projectPath }
  )
  const branchName = branchData?.branchName || featureBranch

  const { tasks, phaseInfoMap } = useMemo(() => parseTasksContent(tasksContent), [tasksContent])

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
    const command = `/speckit.implement ${branchName} ${task.id}`

    try {
      await navigator.clipboard.writeText(command)
      setCopiedTaskId(task.id)
      toast.success("Task command copied", {
        description: `Use "${command}" in a new chat to implement this task`,
      })

      setTimeout(() => setCopiedTaskId(null), 2000)
    } catch {
      toast.error("Failed to copy command")
    }
  }, [branchName])

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
          Click the copy button next to a task or phase to copy the implementation command. Start a new chat and paste the command to begin implementation.
        </p>
      </div>

      {/* Task List with Collapsible Phases */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-2">
        {Object.entries(tasksByPhase).map(([phase, phaseTasks]) => {
          const phaseInfo = phaseInfoMap.get(phase)
          const completedTasks = phaseTasks.filter((t) => t.isComplete).length

          return (
            <PhaseSection
              key={phase}
              phaseNumber={phaseInfo?.number || "?"}
              phaseTitle={phase}
              branchName={branchName}
              totalTasks={phaseTasks.length}
              completedTasks={completedTasks}
              defaultOpen={true}
            >
              {/* Tasks */}
              <div className="space-y-2">
                {phaseTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    branchName={branchName}
                    isCopied={copiedTaskId === task.id}
                    onCopy={() => handleCopyTask(task)}
                    onStart={() => handleStartTask(task)}
                  />
                ))}
              </div>
            </PhaseSection>
          )
        })}

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
  branchName,
  isCopied,
  onCopy,
  onStart,
}: {
  task: ParsedTask
  branchName: string
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
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent side="left">
            <p className="text-xs">Copy command to implement this specific task</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
})

TaskItem.displayName = "TaskItem"
