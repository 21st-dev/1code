"use client"

import { Loader2 } from "lucide-react"
import { memo } from "react"
import { useI18n } from "@/lib/i18n"
import { trpc } from "@/lib/trpc"

interface RunUsageWidgetProps {
  chatId: string
  activeSubChatId?: string | null
}

type UsageTotals = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  messageCount: number
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`
  return tokens.toString()
}

function formatCost(value: number): string {
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function hasUsage(usage: UsageTotals | undefined): boolean {
  return !!usage && usage.messageCount > 0 && usage.totalTokens > 0
}

function UsageMetric({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-2 py-1.5">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {detail && (
          <div className="truncate text-[10px] text-muted-foreground/70">
            {detail}
          </div>
        )}
      </div>
      <div className="font-mono text-xs font-medium text-foreground tabular-nums">
        {value}
      </div>
    </div>
  )
}

function formatInputOutput(
  usage: UsageTotals | undefined,
  inputLabel: string,
  outputLabel: string,
): string {
  if (!usage || (usage.inputTokens <= 0 && usage.outputTokens <= 0)) return ""
  return `${formatTokens(usage.inputTokens)} ${inputLabel} / ${formatTokens(
    usage.outputTokens,
  )} ${outputLabel}`
}

export const RunUsageWidget = memo(function RunUsageWidget({
  chatId,
  activeSubChatId,
}: RunUsageWidgetProps) {
  const { t } = useI18n()
  const usageQuery = trpc.chats.getUsageSummary.useQuery(
    { chatId, subChatId: activeSubChatId ?? null },
    {
      enabled: !!chatId,
      refetchInterval: 5000,
      placeholderData: (previous) => previous,
    },
  )
  const usage = usageQuery.data
  const conversation = usage?.currentConversation
  const workspace = usage?.currentWorkspace
  const conversationAvailable = hasUsage(conversation)
  const workspaceAvailable = hasUsage(workspace)
  const context = usage?.context
  const cost =
    workspace && workspace.estimatedCostUsd > 0
      ? formatCost(workspace.estimatedCostUsd)
      : t("usage.unavailable")

  if (usageQuery.isLoading && !usage) {
    return (
      <div className="flex items-center px-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        {t("details.usage.loading")}
      </div>
    )
  }

  if (!conversationAvailable && !workspaceAvailable && !context) {
    return (
      <div className="px-2 py-3 text-xs text-muted-foreground">
        {t("details.usage.noData")}
      </div>
    )
  }

  return (
    <div className="divide-y divide-border/30">
      <UsageMetric
        label={t("usage.currentConversation")}
        value={
          conversationAvailable
            ? formatTokens(conversation?.totalTokens ?? 0)
            : t("usage.unavailable")
        }
        detail={
          conversationAvailable
            ? formatInputOutput(
                conversation,
                t("usage.inputShort"),
                t("usage.outputShort"),
              )
            : t("details.usage.partialUnavailable")
        }
      />
      <UsageMetric
        label={t("usage.currentWorkspace")}
        value={
          workspaceAvailable
            ? formatTokens(workspace?.totalTokens ?? 0)
            : t("usage.unavailable")
        }
        detail={
          workspaceAvailable
            ? formatInputOutput(
                workspace,
                t("usage.inputShort"),
                t("usage.outputShort"),
              )
            : t("details.usage.partialUnavailable")
        }
      />
      <UsageMetric
        label={t("usage.estimatedCost")}
        value={cost}
        detail={
          workspace && workspace.estimatedCostUsd > 0
            ? t("usage.providerReported")
            : t("details.usage.costUnavailable")
        }
      />
      <UsageMetric
        label={t("usage.context")}
        value={
          context
            ? `${context.percentUsed.toFixed(1)}%`
            : t("usage.unavailable")
        }
        detail={
          context
            ? `${formatTokens(context.usedTokens)} / ${formatTokens(
                context.windowTokens,
              )}`
            : t("usage.contextUnavailable")
        }
      />
    </div>
  )
})
