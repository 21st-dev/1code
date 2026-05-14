"use client"

import { memo } from "react"
import { useI18n } from "@/lib/i18n"

interface AgentToolInterruptedProps {
  toolName: string
  subtitle?: string
}

export const AgentToolInterrupted = memo(function AgentToolInterrupted({
  toolName,
  subtitle,
}: AgentToolInterruptedProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-1.5 rounded-md py-0.5 px-2">
      <span className="text-xs text-muted-foreground">
        {t("agent.tool.interrupted", { tool: toolName })}
      </span>
      {subtitle && (
        <span className="text-xs text-muted-foreground/60 truncate">
          {subtitle}
        </span>
      )}
    </div>
  )
})
