/**
 * WorkflowStepper Component
 *
 * Displays workflow progress with clickable steps for navigation.
 * Shows: Constitution | Specify | Clarify | Plan | Tasks | Implement
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo, useCallback } from "react"
import { Check, Circle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  WORKFLOW_STEP_LABELS,
  WORKFLOW_STEPS_ORDER,
  type WorkflowStepName,
} from "../types"

interface WorkflowStepperProps {
  /** Current workflow step (detected from files) */
  currentStep: WorkflowStepName
  /** Active step being displayed (may differ from currentStep during navigation) */
  activeStep?: WorkflowStepName
  /** Callback when a step is clicked */
  onStepClick?: (step: WorkflowStepName) => void
  /** Whether navigation is enabled */
  enableNavigation?: boolean
  /** Compact mode for smaller displays */
  compact?: boolean
}

/**
 * Determine if a step is completed based on current step
 */
function isStepCompleted(step: WorkflowStepName, currentStep: WorkflowStepName): boolean {
  const stepIndex = WORKFLOW_STEPS_ORDER.indexOf(step)
  const currentIndex = WORKFLOW_STEPS_ORDER.indexOf(currentStep)

  if (stepIndex === -1 || currentIndex === -1) return false
  return stepIndex < currentIndex
}

/**
 * Determine if a step is clickable (completed steps can be revisited)
 */
function isStepClickable(
  step: WorkflowStepName,
  currentStep: WorkflowStepName,
  enableNavigation: boolean
): boolean {
  if (!enableNavigation) return false
  return isStepCompleted(step, currentStep) || step === currentStep
}

/**
 * WorkflowStepper - Progress indicator with navigation
 */
export const WorkflowStepper = memo(function WorkflowStepper({
  currentStep,
  activeStep,
  onStepClick,
  enableNavigation = true,
  compact = false,
}: WorkflowStepperProps) {
  const handleStepClick = useCallback(
    (step: WorkflowStepName) => {
      if (isStepClickable(step, currentStep, enableNavigation)) {
        onStepClick?.(step)
      }
    },
    [currentStep, enableNavigation, onStepClick]
  )

  // Filter out 'analyze' step as it's not shown in the UI
  const visibleSteps = WORKFLOW_STEPS_ORDER.filter((step) => step !== "analyze")

  return (
    <div
      className={cn(
        "flex items-center",
        compact ? "gap-1" : "gap-2"
      )}
      role="navigation"
      aria-label="Workflow steps"
    >
      {visibleSteps.map((step, index) => {
        const isCompleted = isStepCompleted(step, currentStep)
        const isCurrent = step === currentStep
        const isActive = step === (activeStep || currentStep)
        const isClickable = isStepClickable(step, currentStep, enableNavigation)
        const isLast = index === visibleSteps.length - 1

        return (
          <div key={step} className="flex items-center">
            {/* Step Button */}
            <button
              type="button"
              onClick={() => handleStepClick(step)}
              disabled={!isClickable}
              className={cn(
                "flex items-center gap-1.5 rounded-md transition-colors",
                compact ? "px-2 py-1" : "px-3 py-1.5",
                // Clickable states
                isClickable && "cursor-pointer hover:bg-muted/50",
                !isClickable && "cursor-default",
                // Visual states
                isActive && "bg-primary/10",
                // Focus styles
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              )}
              aria-current={isCurrent ? "step" : undefined}
              aria-disabled={!isClickable}
            >
              {/* Step Icon */}
              <div
                className={cn(
                  "flex items-center justify-center rounded-full",
                  compact ? "w-4 h-4" : "w-5 h-5",
                  // Completed
                  isCompleted && "bg-green-500 text-white",
                  // Current
                  isCurrent && !isCompleted && "bg-primary text-primary-foreground",
                  // Future
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
                ) : (
                  <Circle
                    className={cn(
                      compact ? "h-2 w-2" : "h-2.5 w-2.5",
                      isCurrent ? "fill-current" : ""
                    )}
                  />
                )}
              </div>

              {/* Step Label */}
              <span
                className={cn(
                  "font-medium",
                  compact ? "text-xs" : "text-sm",
                  isCompleted && "text-muted-foreground",
                  isCurrent && "text-primary",
                  !isCompleted && !isCurrent && "text-muted-foreground/60"
                )}
              >
                {WORKFLOW_STEP_LABELS[step]}
              </span>
            </button>

            {/* Connector */}
            {!isLast && (
              <ChevronRight
                className={cn(
                  "text-muted-foreground/40 flex-shrink-0",
                  compact ? "h-3 w-3 mx-0.5" : "h-4 w-4 mx-1"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
})

WorkflowStepper.displayName = "WorkflowStepper"

/**
 * Vertical variant of the stepper for sidebar display
 */
export const WorkflowStepperVertical = memo(function WorkflowStepperVertical({
  currentStep,
  activeStep,
  onStepClick,
  enableNavigation = true,
}: Omit<WorkflowStepperProps, "compact">) {
  const handleStepClick = useCallback(
    (step: WorkflowStepName) => {
      if (isStepClickable(step, currentStep, enableNavigation)) {
        onStepClick?.(step)
      }
    },
    [currentStep, enableNavigation, onStepClick]
  )

  // Filter out 'analyze' step
  const visibleSteps = WORKFLOW_STEPS_ORDER.filter((step) => step !== "analyze")

  return (
    <div className="flex flex-col gap-1" role="navigation" aria-label="Workflow steps">
      {visibleSteps.map((step, index) => {
        const isCompleted = isStepCompleted(step, currentStep)
        const isCurrent = step === currentStep
        const isActive = step === (activeStep || currentStep)
        const isClickable = isStepClickable(step, currentStep, enableNavigation)
        const isLast = index === visibleSteps.length - 1

        return (
          <div key={step} className="flex items-start">
            {/* Vertical line connector */}
            <div className="flex flex-col items-center mr-3">
              {/* Step Indicator */}
              <div
                className={cn(
                  "flex items-center justify-center rounded-full w-6 h-6",
                  isCompleted && "bg-green-500 text-white",
                  isCurrent && !isCompleted && "bg-primary text-primary-foreground",
                  !isCompleted && !isCurrent && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 h-6 mt-1",
                    isCompleted ? "bg-green-500" : "bg-muted"
                  )}
                />
              )}
            </div>

            {/* Step Content */}
            <button
              type="button"
              onClick={() => handleStepClick(step)}
              disabled={!isClickable}
              className={cn(
                "flex-1 text-left py-1 rounded-md transition-colors",
                isClickable && "cursor-pointer hover:bg-muted/50",
                !isClickable && "cursor-default",
                isActive && "bg-primary/10",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              )}
              aria-current={isCurrent ? "step" : undefined}
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  isCompleted && "text-muted-foreground",
                  isCurrent && "text-primary",
                  !isCompleted && !isCurrent && "text-muted-foreground/60"
                )}
              >
                {WORKFLOW_STEP_LABELS[step]}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
})

WorkflowStepperVertical.displayName = "WorkflowStepperVertical"
