"use client"

import { memo } from "react"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../../../components/ui/hover-card"
import { cn } from "../../../lib/utils"
import { useI18n } from "../../../lib/i18n"
import type { GuardedRunAudit } from "../../../../shared/agent-scope-contracts"

export interface AgentMessageMetadata {
  provider?: "claude-code" | "codex"
  model?: string
  sessionId?: string
  totalCostUsd?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  finalTextId?: string
  durationMs?: number
  resultSubtype?: string
  guardedRun?: {
    contractId: string
    runId?: string
    runtime: "claude" | "codex"
    enforcementMode: "hard" | "contract-and-audit"
    audit?: GuardedRunAudit
  }
}

interface AgentMessageUsageProps {
  metadata?: AgentMessageMetadata
  isStreaming?: boolean
  isMobile?: boolean
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`
  }
  return tokens.toString()
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  }
  const seconds = ms / 1000
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.round(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function formatCost(value: number): string {
  if (value < 0.01) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(2)}`
}

export const AgentMessageUsage = memo(function AgentMessageUsage({
  metadata,
  isStreaming = false,
  isMobile = false,
}: AgentMessageUsageProps) {
  const { t } = useI18n()

  if (!metadata || isStreaming) return null

  const {
    provider,
    model,
    inputTokens = 0,
    outputTokens = 0,
    totalTokens = 0,
    totalCostUsd = 0,
    durationMs,
    resultSubtype,
  } = metadata

  const hasUsage = inputTokens > 0 || outputTokens > 0

  if (!hasUsage) return null

  const normalizedModel = typeof model === "string" ? model.toLowerCase() : ""
  const isCodexModel =
    provider === "codex" ||
    normalizedModel.includes("codex") ||
    normalizedModel.startsWith("gpt-")
  const displayTokens = isCodexModel
    ? inputTokens + outputTokens
    : totalTokens || inputTokens + outputTokens

  return (
    <HoverCard openDelay={400} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          tabIndex={-1}
          className={cn(
            "h-5 px-1.5 flex items-center text-[10px] rounded-md",
            "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/50",
            "transition-[background-color,transform] duration-150 ease-out",
          )}
        >
          <span className="font-mono">{formatTokens(displayTokens)}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        sideOffset={4}
        align="end"
        className="w-auto pt-2 px-2 pb-0 shadow-sm rounded-lg border-border/50 overflow-hidden"
      >
        <div className="space-y-1.5 pb-2">
          {/* Status & Duration group */}
          {(resultSubtype || (durationMs !== undefined && durationMs > 0)) && (
            <div className="space-y-1">
              {resultSubtype && (
                <div className="flex justify-between text-xs gap-4">
                  <span className="text-muted-foreground">{t("agent.usage.status")}</span>
                  <span className="font-mono text-foreground">
                    {resultSubtype === "success" ? t("agent.usage.success") : t("agent.usage.failed")}
                  </span>
                </div>
              )}

              {durationMs !== undefined && durationMs > 0 && (
                <div className="flex justify-between text-xs gap-4">
                  <span className="text-muted-foreground">{t("agent.usage.duration")}</span>
                  <span className="font-mono text-foreground">
                    {formatDuration(durationMs)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tokens group */}
          {displayTokens > 0 && (
            <div className="space-y-1 pt-1.5 mt-1 border-t border-border/50">
              <div className="flex justify-between text-xs gap-4">
                <span className="text-muted-foreground">{t("agent.usage.tokens")}</span>
                <span className="font-mono font-medium text-foreground">
                  {displayTokens.toLocaleString()}
                </span>
              </div>
              {inputTokens > 0 && (
                <div className="flex justify-between text-xs gap-4">
                  <span className="text-muted-foreground">{t("agent.usage.input")}</span>
                  <span className="font-mono text-foreground">
                    {inputTokens.toLocaleString()}
                  </span>
                </div>
              )}
              {outputTokens > 0 && (
                <div className="flex justify-between text-xs gap-4">
                  <span className="text-muted-foreground">{t("agent.usage.output")}</span>
                  <span className="font-mono text-foreground">
                    {outputTokens.toLocaleString()}
                  </span>
                </div>
              )}
              {totalCostUsd > 0 && (
                <div className="flex justify-between text-xs gap-4">
                  <span className="text-muted-foreground">{t("agent.usage.estimatedCost")}</span>
                  <span className="font-mono text-foreground">
                    {formatCost(totalCostUsd)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  )
})
