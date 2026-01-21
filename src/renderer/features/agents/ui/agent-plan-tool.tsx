"use client"

import { memo, useState } from "react"
import { TextShimmer } from "../../../components/ui/text-shimmer"
import {
  IconSpinner,
  ExpandIcon,
  CollapseIcon,
  PlanningIcon,
  CheckIcon,
} from "../../../components/ui/icons"
import { getToolStatus } from "./agent-tool-registry"
import { areToolPropsEqual } from "./agent-tool-utils"
import { cn } from "../../../lib/utils"
import { Circle, SkipForward, FileCode2 } from "lucide-react"

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

interface AgentPlanToolProps {
  part: {
    type: string
    toolCallId: string
    state?: string
    input?: {
      action?: "create" | "update" | "approve" | "complete"
      plan?: Plan
    }
    output?: {
      success?: boolean
      message?: string
    }
  }
  chatStatus?: string
}

const StepStatusIcon = ({ status, isPending }: { status: PlanStep["status"]; isPending?: boolean }) => {
  // During loading, show spinner for in_progress items
  if (isPending && status === "in_progress") {
    return (
      <div 
        className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ border: '0.5px solid hsl(var(--muted-foreground) / 0.3)' }}
      >
        <IconSpinner className="w-2.5 h-2.5" />
      </div>
    )
  }

  switch (status) {
    case "completed":
      return (
        <div 
          className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
          style={{ border: '0.5px solid hsl(var(--border))' }}
        >
          <CheckIcon className="w-2 h-2 text-muted-foreground" />
        </div>
      )
    case "in_progress":
      return (
        <div 
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: '0.5px solid hsl(var(--muted-foreground) / 0.3)' }}
        >
          <IconSpinner className="w-2.5 h-2.5" />
        </div>
      )
    case "skipped":
      return (
        <div 
          className="w-3.5 h-3.5 rounded-full bg-muted flex items-center justify-center flex-shrink-0"
          style={{ border: '0.5px solid hsl(var(--border))' }}
        >
          <SkipForward className="w-2 h-2 text-muted-foreground" />
        </div>
      )
    default:
      return (
        <div 
          className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ border: '0.5px solid hsl(var(--muted-foreground) / 0.3)' }}
        />
      )
  }
}

const ComplexityBadge = ({ complexity }: { complexity?: "low" | "medium" | "high" }) => {
  if (!complexity) return null
  
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
      {complexity}
    </span>
  )
}

export const AgentPlanTool = memo(function AgentPlanTool({
  part,
  chatStatus,
}: AgentPlanToolProps) {
  const [isExpanded, setIsExpanded] = useState(false) // Collapsed by default
  const { isPending } = getToolStatus(part, chatStatus)

  const plan = part.input?.plan
  const action = part.input?.action || "create"
  
  if (!plan) {
    return null
  }

  const steps = plan.steps || []
  const completedCount = steps.filter(s => s.status === "completed").length
  const inProgressCount = steps.filter(s => s.status === "in_progress").length
  const totalSteps = steps.length

  // Determine header title based on action and status
  const getHeaderTitle = () => {
    if (isPending) {
      if (action === "create") return "Creating plan..."
      if (action === "approve") return "Approving plan..."
      if (action === "complete") return "Completing plan..."
      return "Updating plan..."
    }
    
    if (plan.status === "awaiting_approval") return "Plan ready for review"
    if (plan.status === "completed") return "Plan completed"
    if (plan.status === "approved") return "Plan approved"
    return plan.title
  }

  // Progress text
  const getProgressText = () => {
    if (totalSteps === 0) return null
    if (completedCount === totalSteps) {
      return `${completedCount} of ${totalSteps} Completed`
    }
    if (inProgressCount > 0) {
      return `${completedCount} of ${totalSteps} Completed, ${inProgressCount} in progress`
    }
    return `${completedCount} of ${totalSteps} Completed`
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden mx-2">
      {/* Header - click anywhere to expand/collapse */}
      <div 
        className="flex items-center justify-between px-2.5 py-2 cursor-pointer hover:bg-muted/50 transition-colors duration-150"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <PlanningIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-col min-w-0 flex-1">
            {isPending ? (
              <TextShimmer
                as="span"
                duration={1.2}
                className="text-xs font-medium"
              >
                {getHeaderTitle()}
              </TextShimmer>
            ) : (
              <span className="text-xs font-medium text-foreground truncate">
                {getHeaderTitle()}
              </span>
            )}
            {plan.summary && !isExpanded && (
              <span className="text-[11px] text-muted-foreground/60 truncate">
                {plan.summary}
              </span>
            )}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {isPending && <IconSpinner className="w-3 h-3" />}
          
          {/* Progress indicator */}
          {totalSteps > 0 && !isPending && (
            <span className="text-xs text-muted-foreground">
              {completedCount}/{totalSteps}
            </span>
          )}

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

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Summary */}
          {plan.summary && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground border-b border-border/50">
              {plan.summary}
            </div>
          )}

          {/* Progress bar */}
          {totalSteps > 0 && (
            <div className="px-2.5 py-2 border-b border-border/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">
                  {getProgressText()}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-muted-foreground/50 transition-all duration-300 ease-out"
                  style={{ width: `${(completedCount / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Steps list */}
          <div className="max-h-[300px] overflow-y-auto">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className={cn(
                  "px-2.5 py-2 hover:bg-muted/30 transition-colors duration-150",
                  idx !== steps.length - 1 && "border-b border-border/30"
                )}
              >
                <div className="flex items-start gap-2">
                  <StepStatusIcon status={step.status} isPending={isPending} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-medium",
                        step.status === "completed" && "line-through text-muted-foreground",
                        step.status === "skipped" && "line-through text-muted-foreground/60"
                      )}>
                        {step.title}
                      </span>
                      <ComplexityBadge complexity={step.estimatedComplexity} />
                    </div>
                    
                    {step.description && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-relaxed">
                        {step.description}
                      </p>
                    )}
                    
                    {/* Files */}
                    {step.files && step.files.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {step.files.map((file, fileIdx) => (
                          <span
                            key={fileIdx}
                            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            <FileCode2 className="w-2.5 h-2.5" />
                            {file.split("/").pop()}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Plan status footer */}
          {plan.status === "awaiting_approval" && (
            <div className="px-2.5 py-2 border-t border-border bg-muted/50">
              <span className="text-xs text-muted-foreground">
                Awaiting your approval to proceed
              </span>
            </div>
          )}
          
          {plan.status === "completed" && (
            <div className="px-2.5 py-2 border-t border-border bg-muted/50">
              <span className="text-xs text-muted-foreground">
                Plan completed successfully
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}, areToolPropsEqual)
