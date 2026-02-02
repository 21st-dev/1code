/**
 * PlanStep Component
 *
 * Third workflow step for generating and reviewing the implementation plan.
 * Shows plan.md content with approve/regenerate actions.
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useCallback } from "react"
import { FileCode, Sparkles, Loader2, CheckCircle2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { MarkdownView } from "../markdown-view"

interface PlanStepProps {
  /** Plan content (if exists) */
  planContent?: string
  /** Whether plan exists */
  planExists: boolean
  /** Callback to generate plan */
  onGenerate: () => void
  /** Callback to regenerate plan */
  onRegenerate: () => void
  /** Callback to approve plan and proceed */
  onApprove: () => void
  /** Whether the command is executing */
  isExecuting: boolean
  /** Whether this step is completed */
  isCompleted: boolean
}

/**
 * PlanStep - Implementation plan generation and review
 */
export const PlanStep = memo(function PlanStep({
  planContent,
  planExists,
  onGenerate,
  onRegenerate,
  onApprove,
  isExecuting,
  isCompleted,
}: PlanStepProps) {
  const handleAction = useCallback(() => {
    if (planExists) {
      onApprove()
    } else {
      onGenerate()
    }
  }, [planExists, onApprove, onGenerate])

  // No plan yet - show generate button
  if (!planExists && !planContent) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <FileCode className="h-12 w-12 text-primary/50 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Generate Implementation Plan</h2>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
          Create a detailed implementation plan based on the specification.
          The plan will include architecture decisions, file structure, and technical approach.
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
              Generating Plan...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Plan
            </>
          )}
        </Button>
      </div>
    )
  }

  // Plan exists - show content with actions
  return (
    <div className="flex flex-col h-full p-6 overflow-hidden">
      {/* Header */}
      <div className="mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Implementation Plan</h2>
            {planExists && (
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
          Review the plan below. You can regenerate if needed or proceed to tasks.
        </p>
      </div>

      {/* Plan Content */}
      <div className="flex-1 overflow-y-auto bg-muted/20 rounded-lg p-4 border border-border/50">
        {isExecuting ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Generating plan...</p>
            </div>
          </div>
        ) : planContent ? (
          <MarkdownView content={planContent} size="md" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Plan content will appear here</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-border/50 mt-4 flex-shrink-0">
        <p className="text-xs text-muted-foreground">
          {planExists
            ? "Plan generated successfully. Review and proceed to generate tasks."
            : "Generate a plan to continue."}
        </p>
        <Button
          onClick={handleAction}
          disabled={isExecuting || (!planExists && !planContent)}
          className="min-w-[160px]"
        >
          {isExecuting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : planExists ? (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Proceed to Tasks
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Plan
            </>
          )}
        </Button>
      </div>
    </div>
  )
})

PlanStep.displayName = "PlanStep"
