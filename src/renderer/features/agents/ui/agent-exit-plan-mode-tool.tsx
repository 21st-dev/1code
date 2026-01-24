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
  part: _part,
}: AgentExitPlanModeToolProps) {
  // Plan content is now shown in the artifact sidebar, not inline in chat
  return null
}, areToolPropsEqual)
