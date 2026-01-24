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
  part: _part,
  chatStatus: _chatStatus,
}: AgentPlanToolProps) {
  // Plan content is now shown in the artifact sidebar, not inline in chat
  return null
}, areToolPropsEqual)
