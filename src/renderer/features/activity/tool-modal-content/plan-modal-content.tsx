"use client"

import { useMemo } from "react"
import { Circle, SkipForward, FileCode2, Check, ClipboardList } from "lucide-react"
import { type ToolActivity } from "../../../lib/atoms"
import { cn } from "../../../lib/utils"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"

interface PlanStep {
  id: string
  title: string
  description?: string
  files?: readonly string[] | string[]
  estimatedComplexity?: "low" | "medium" | "high"
  status: "pending" | "in_progress" | "completed" | "skipped"
}

interface Plan {
  id: string
  title: string
  summary?: string
  steps: readonly PlanStep[] | PlanStep[]
  status: "draft" | "awaiting_approval" | "approved" | "in_progress" | "completed"
}

interface PlanModalContentProps {
  activity: ToolActivity
}

function parseActivityData(activity: ToolActivity) {
  let input: { action?: string; plan?: Plan } = {}
  let output: { success?: boolean; message?: string } = {}

  try {
    if (activity.input) {
      input = JSON.parse(activity.input)
    }
  } catch {
    // Keep empty
  }

  try {
    if (activity.output) {
      output = JSON.parse(activity.output)
    }
  } catch {
    // Keep empty
  }

  return { input, output }
}

function StepStatusIcon({ status }: { status: PlanStep["status"] }) {
  switch (status) {
    case "completed":
      return (
        <div
          className="w-4 h-4 rounded-full bg-green-500/10 flex items-center justify-center flex-shrink-0"
        >
          <Check className="w-2.5 h-2.5 text-green-500" />
        </div>
      )
    case "in_progress":
      return (
        <div
          className="w-4 h-4 rounded-full border-2 border-blue-500 flex items-center justify-center flex-shrink-0 animate-pulse"
        >
          <Circle className="w-1.5 h-1.5 fill-blue-500 text-blue-500" />
        </div>
      )
    case "skipped":
      return (
        <div
          className="w-4 h-4 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
        >
          <SkipForward className="w-2.5 h-2.5 text-muted-foreground" />
        </div>
      )
    default:
      return (
        <div
          className="w-4 h-4 rounded-full border border-muted-foreground/30 flex-shrink-0"
        />
      )
  }
}

function ComplexityBadge({ complexity }: { complexity?: "low" | "medium" | "high" }) {
  if (!complexity) return null

  const colors = {
    low: "bg-green-500/10 text-green-600 dark:text-green-400",
    medium: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    high: "bg-red-500/10 text-red-600 dark:text-red-400",
  }

  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", colors[complexity])}>
      {complexity}
    </span>
  )
}

function PlanStatusBadge({ status }: { status: Plan["status"] }) {
  const statusConfig = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    awaiting_approval: { label: "Awaiting Approval", className: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400" },
    approved: { label: "Approved", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    in_progress: { label: "In Progress", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    completed: { label: "Completed", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
  }

  const config = statusConfig[status] || statusConfig.draft

  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", config.className)}>
      {config.label}
    </span>
  )
}

export function PlanModalContent({ activity }: PlanModalContentProps) {
  const { input, output } = useMemo(() => parseActivityData(activity), [activity])

  const plan = input.plan
  const action = input.action || "create"

  if (!plan) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No plan data available
      </div>
    )
  }

  const steps = plan.steps || []
  const completedCount = steps.filter(s => s.status === "completed").length
  const totalSteps = steps.length
  const progressPercent = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-muted">
          <ClipboardList className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{plan.title}</h3>
            <PlanStatusBadge status={plan.status} />
          </div>
          {plan.summary && (
            <p className="text-sm text-muted-foreground mt-1">
              {plan.summary}
            </p>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {totalSteps > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm text-muted-foreground">
              {completedCount} of {totalSteps} steps completed
            </span>
            <span className="text-sm font-medium">
              {Math.round(progressPercent)}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps list */}
      {steps.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
            {steps.map((step, idx) => (
              <div
                key={step.id || idx}
                className={cn(
                  "p-3",
                  step.status === "in_progress" && "bg-blue-500/5",
                )}
              >
                <div className="flex items-start gap-3">
                  <StepStatusIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "text-sm font-medium",
                        step.status === "completed" && "line-through text-muted-foreground",
                        step.status === "skipped" && "line-through text-muted-foreground/60"
                      )}>
                        {step.title}
                      </span>
                      <ComplexityBadge complexity={step.estimatedComplexity} />
                    </div>

                    {step.description && (
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {step.description}
                      </p>
                    )}

                    {/* Files */}
                    {step.files && step.files.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {step.files.map((file, fileIdx) => (
                          <span
                            key={fileIdx}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                          >
                            <FileCode2 className="w-2.5 h-2.5" />
                            {typeof file === 'string' ? file.split("/").pop() : file}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status footer */}
      {plan.status === "awaiting_approval" && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-md p-3 text-sm text-yellow-600 dark:text-yellow-400">
          This plan is awaiting your approval to proceed.
        </div>
      )}

      {/* Error if present */}
      {activity.errorText && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive whitespace-pre-wrap">
          {activity.errorText}
        </div>
      )}
    </div>
  )
}

/**
 * Modal content for ExitPlanMode - shows the final plan markdown
 */
export function ExitPlanModalContent({ activity }: PlanModalContentProps) {
  const { output } = useMemo(() => {
    let output: { plan?: string } = {}
    try {
      if (activity.output) {
        output = JSON.parse(activity.output)
      }
    } catch {
      // Keep empty
    }
    return { output }
  }, [activity])

  const planText = typeof output.plan === "string" ? output.plan : ""

  if (!planText) {
    return (
      <div className="text-sm text-muted-foreground italic">
        No plan content available
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Check className="w-4 h-4 text-green-500" />
        <span>Plan ready for approval</span>
      </div>

      {/* Plan markdown content */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto p-4">
          <ChatMarkdownRenderer content={planText} size="sm" />
        </div>
      </div>

      {/* Error if present */}
      {activity.errorText && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive whitespace-pre-wrap">
          {activity.errorText}
        </div>
      )}
    </div>
  )
}
