"use client"

import { memo } from "react"
import { ChatMarkdownRenderer } from "../../../components/chat-markdown-renderer"
import { areToolPropsEqual } from "./agent-tool-utils"

interface ExitPlanModeToolPart {
  type: string
  state: string
  input?: Record<string, unknown>
  output?: {
    plan?: string
  }
}

interface AgentExitPlanModeToolProps {
  part: ExitPlanModeToolPart
  chatStatus?: string
}

export const AgentExitPlanModeTool = memo(function AgentExitPlanModeTool({
  part,
}: AgentExitPlanModeToolProps) {
  // Get plan text from output.plan
  const planText = typeof part.output?.plan === "string" ? part.output.plan : ""

  if (!planText) {
    return null
  }

  return (
    <div className="text-foreground px-2 pt-3 border-t border-border/50" data-plan-section="true">
      <div className="text-[12px] uppercase tracking-wider text-muted-foreground/60 font-medium mb-1">
        Plan
      </div>
      <ChatMarkdownRenderer content={planText} size="sm" />
    </div>
  )
}, areToolPropsEqual)
