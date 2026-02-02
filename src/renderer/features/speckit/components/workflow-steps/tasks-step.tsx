/**
 * TasksStep Component
 *
 * Fourth workflow step for generating the task breakdown.
 * Shows tasks.md generation with completion message.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useCallback } from "react"
import { ListTodo, Sparkles, Loader2, CheckCircle2, RefreshCw, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MarkdownView } from "../markdown-view"

interface TasksStepProps {
  /** Tasks content (if exists) */
  tasksContent?: string
  /** Whether tasks exist */
  tasksExist: boolean
  /** Callback to generate tasks */
  onGenerate: () => void
  /** Callback to regenerate tasks */
  onRegenerate: () => void
  /** Callback to proceed to implement */
  onProceed: () => void
  /** Whether the command is executing */
  isExecuting: boolean
  /** Whether this step is completed */
  isCompleted: boolean
}

/**
 * TasksStep - Task breakdown generation
 */
export const TasksStep = memo(function TasksStep({
  tasksContent,
  tasksExist,
  onGenerate,
  onRegenerate,
  onProceed,
  isExecuting,
  isCompleted,
}: TasksStepProps) {
  const handleAction = useCallback(() => {
    if (tasksExist) {
      onProceed()
    } else {
      onGenerate()
    }
  }, [tasksExist, onProceed, onGenerate])

  // No tasks yet - show generate button
  if (!tasksExist && !tasksContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <ListTodo className="h-12 w-12 text-primary/50 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Generate Task Breakdown</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Create a detailed task list based on the implementation plan.
          Tasks will be organized by phase with dependencies marked.
        </p>
        <Button
          onClick={onGenerate}
          disabled={isExecuting}
          size="lg"
          className="min-w-[180px]"
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Tasks...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Tasks
            </>
          )}
        </Button>
      </div>
    )
  }

  // Tasks exist - show content with actions
  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Task Breakdown</h2>
            {tasksExist && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <CheckCircle2 className="h-3 w-3" />
                Generated
              </span>
            )}
          </div>
          {!isExecuting && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              className="text-muted-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Regenerate
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Review the task breakdown. Proceed to implementation when ready.
        </p>
      </div>

      {/* Tasks Content */}
      <div className="flex-1 overflow-y-auto bg-muted/20 rounded-lg p-4 border border-border/50">
        {isExecuting ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Generating tasks...</p>
            </div>
          </div>
        ) : tasksContent ? (
          <MarkdownView content={tasksContent} size="md" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Task content will appear here</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4 flex-shrink-0">
        <p className="text-xs text-muted-foreground">
          {tasksExist
            ? "Tasks generated. Proceed to implementation."
            : "Generate tasks to continue."}
        </p>
        <Button
          onClick={handleAction}
          disabled={isExecuting || (!tasksExist && !tasksContent)}
          className="min-w-[180px]"
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : tasksExist ? (
            <>
              <ArrowRight className="h-4 w-4 mr-2" />
              Proceed to Implement
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Tasks
            </>
          )}
        </Button>
      </div>
    </div>
  )
})

TasksStep.displayName = "TasksStep"
