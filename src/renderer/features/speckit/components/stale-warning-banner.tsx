/**
 * StaleWarningBanner Component
 *
 * Non-blocking warning shown when navigating to a previous step
 * that has downstream artifacts (e.g., spec has plan.md downstream).
 *
 * @see specs/001-speckit-ui-integration/plan.md
 */

import { memo } from "react"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { WorkflowStepName } from "../types"

interface StaleWarningBannerProps {
  /** Current step being navigated to */
  step: WorkflowStepName
  /** Downstream artifacts that exist */
  downstreamArtifacts: string[]
  /** Callback to dismiss the warning */
  onDismiss: () => void
  /** Additional CSS classes */
  className?: string
}

/**
 * Map of steps to their downstream artifacts
 */
const DOWNSTREAM_ARTIFACTS: Record<WorkflowStepName, string[]> = {
  "no-feature": [],
  constitution: ["spec.md", "plan.md", "tasks.md"],
  specify: ["plan.md", "tasks.md"],
  clarify: ["plan.md", "tasks.md"],
  plan: ["tasks.md"],
  tasks: [],
  analyze: [],
  implement: [],
}

/**
 * Check if navigating to a step would make downstream artifacts stale
 */
export function checkStaleArtifacts(
  targetStep: WorkflowStepName,
  existingArtifacts: { spec: boolean; plan: boolean; tasks: boolean }
): string[] {
  const downstream = DOWNSTREAM_ARTIFACTS[targetStep]
  const stale: string[] = []

  if (downstream.includes("spec.md") && existingArtifacts.spec) {
    stale.push("spec.md")
  }
  if (downstream.includes("plan.md") && existingArtifacts.plan) {
    stale.push("plan.md")
  }
  if (downstream.includes("tasks.md") && existingArtifacts.tasks) {
    stale.push("tasks.md")
  }

  return stale
}

/**
 * StaleWarningBanner - Warning for stale downstream artifacts
 */
export const StaleWarningBanner = memo(function StaleWarningBanner({
  step,
  downstreamArtifacts,
  onDismiss,
  className,
}: StaleWarningBannerProps) {
  if (downstreamArtifacts.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50",
        className
      )}
      role="alert"
    >
      <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-500 flex-shrink-0" />
      <p className="flex-1 text-sm text-amber-800 dark:text-amber-200">
        Modifying this step may make the following artifacts outdated:{" "}
        <span className="font-medium">
          {downstreamArtifacts.join(", ")}
        </span>
      </p>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-amber-600 hover:text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/50"
        onClick={onDismiss}
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Dismiss warning</span>
      </Button>
    </div>
  )
})

StaleWarningBanner.displayName = "StaleWarningBanner"
