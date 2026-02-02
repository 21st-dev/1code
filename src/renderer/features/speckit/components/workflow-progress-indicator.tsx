/**
 * WorkflowProgressIndicator Component
 *
 * Visual indicator showing progress through the workflow steps:
 * Spec → Plan → Tasks → Implement
 *
 * @see specs/001-speckit-ui-integration/tasks.md T161
 */

import { memo } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WorkflowStepName } from "../types"

interface WorkflowProgressIndicatorProps {
  /** Current workflow step */
  currentStep: WorkflowStepName
  /** Completed steps */
  completedSteps: Set<WorkflowStepName>
}

const WORKFLOW_STEPS = [
  { key: "specify" as const, label: "Spec" },
  { key: "plan" as const, label: "Plan" },
  { key: "tasks" as const, label: "Tasks" },
  { key: "implement" as const, label: "Implement" },
]

/**
 * WorkflowProgressIndicator - Shows workflow progress
 *
 * Displays a horizontal stepper showing which steps are complete
 * and which step is currently active.
 */
export const WorkflowProgressIndicator = memo(function WorkflowProgressIndicator({
  currentStep,
  completedSteps,
}: WorkflowProgressIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {WORKFLOW_STEPS.map((step, index) => {
        const isCompleted = completedSteps.has(step.key)
        const isCurrent = currentStep === step.key
        const isLast = index === WORKFLOW_STEPS.length - 1

        return (
          <div key={step.key} className="flex items-center gap-2">
            {/* Step indicator */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-colors",
                  isCompleted && "bg-green-500/20 text-green-600 dark:text-green-400",
                  isCurrent && !isCompleted && "bg-blue-500/20 text-blue-600 dark:text-blue-400",
                  !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-sm font-medium transition-colors",
                  isCurrent && "text-foreground",
                  !isCurrent && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div
                className={cn(
                  "h-[2px] w-8 transition-colors",
                  isCompleted ? "bg-green-500/40" : "bg-border"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
})
