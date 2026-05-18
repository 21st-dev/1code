"use client"

import { memo, useMemo, useState, type ReactNode } from "react"
import { useAtom } from "jotai"
import { BarChart3, ExternalLink } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../components/ui/tooltip"
import { trpc } from "../../lib/trpc"
import { useI18n } from "../../lib/i18n"
import { usageBudgetAtom } from "../../lib/atoms"
import { cn } from "../../lib/utils"

const CLAUDE_USAGE_URL = "https://claude.ai/settings/usage"
const CODEX_USAGE_URL = "https://chatgpt.com/codex/settings/usage"

type UsageTotals = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  messageCount: number
}

interface UsagePopoverProps {
  chatId: string | null
  subChatId: string | null
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`
  }
  return tokens.toString()
}

function formatSignedTokens(tokens: number): string {
  if (tokens >= 0) return formatTokens(tokens)
  return `-${formatTokens(Math.abs(tokens))}`
}

function formatCost(value: number): string {
  if (value < 0.01) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(2)}`
}

function formatInputOutput(
  usage: UsageTotals,
  inputLabel: string,
  outputLabel: string,
): string {
  if (usage.inputTokens <= 0 && usage.outputTokens <= 0) {
    return ""
  }
  return `${formatTokens(usage.inputTokens)} ${inputLabel} / ${formatTokens(usage.outputTokens)} ${outputLabel}`
}

function MetricRow({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        {detail && (
          <div className="text-[10px] text-muted-foreground/60 tabular-nums">
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

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
      {children}
    </div>
  )
}

function BudgetProgress({ percent }: { percent: number }) {
  return (
    <div className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-[width,background-color] duration-150",
          percent >= 100 ? "bg-destructive" : "bg-primary",
        )}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  )
}

function ProviderRow({
  label,
  status,
  quota,
  href,
}: {
  label: string
  status: string
  quota: string
  href: string
}) {
  const { t } = useI18n()

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <div className="text-xs text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground/60 truncate">
          {status}
        </div>
        <div className="text-[10px] text-muted-foreground/60 truncate">
          {t("usage.remaining")}: {quota}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void window.desktopApi?.openExternal(href)}
        className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
      >
        <span>{t("usage.open")}</span>
        <ExternalLink className="h-3 w-3" />
      </button>
    </div>
  )
}

export const UsagePopover = memo(function UsagePopover({
  chatId,
  subChatId,
}: UsagePopoverProps) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [usageBudget, setUsageBudget] = useAtom(usageBudgetAtom)

  const usageQuery = trpc.chats.getUsageSummary.useQuery(
    { chatId, subChatId },
    {
      enabled: open,
      refetchInterval: open ? 5000 : false,
      placeholderData: (previous) => previous,
    },
  )
  const claudeIntegrationQuery = trpc.claudeCode.getIntegration.useQuery(
    undefined,
    { enabled: open, staleTime: 30_000 },
  )
  const codexIntegrationQuery = trpc.codex.getIntegration.useQuery(undefined, {
    enabled: open,
    staleTime: 30_000,
  })

  const usage = usageQuery.data

  const contextValue = useMemo(() => {
    const context = usage?.context
    if (!context) return t("usage.unavailable")
    return `${context.percentUsed.toFixed(1)}%`
  }, [t, usage?.context])

  const contextDetail = useMemo(() => {
    const context = usage?.context
    if (!context) return t("usage.contextUnavailable")
    return `${formatTokens(context.usedTokens)} / ${formatTokens(context.windowTokens)}`
  }, [t, usage?.context])

  const claudeStatus = claudeIntegrationQuery.isLoading
    ? t("usage.status.loading")
    : claudeIntegrationQuery.data?.isConnected
      ? t("usage.status.connected")
      : claudeIntegrationQuery.data
        ? t("usage.status.notConnected")
        : t("usage.status.unknown")

  const codexStatus = codexIntegrationQuery.isLoading
    ? t("usage.status.loading")
    : codexIntegrationQuery.data?.state === "connected_chatgpt"
      ? t("usage.status.connectedChatGPT")
      : codexIntegrationQuery.data?.state === "connected_api_key"
        ? t("usage.status.connectedApiKey")
        : codexIntegrationQuery.data
          ? t("usage.status.notConnected")
          : t("usage.status.unknown")

  const estimatedCost =
    usage?.currentWorkspace.estimatedCostUsd &&
    usage.currentWorkspace.estimatedCostUsd > 0
      ? usage.currentWorkspace.estimatedCostUsd
      : 0

  const weeklyBudgetTokens = Math.max(
    0,
    Number.isFinite(usageBudget.weeklyTokenBudget)
      ? Math.floor(usageBudget.weeklyTokenBudget)
      : 0,
  )
  const last7DaysTokens = usage?.last7Days.totalTokens ?? 0
  const budgetRemaining =
    weeklyBudgetTokens > 0 ? weeklyBudgetTokens - last7DaysTokens : null
  const budgetPercent =
    weeklyBudgetTokens > 0
      ? Math.min(100, (last7DaysTokens / weeklyBudgetTokens) * 100)
      : 0
  const budgetRemainingDetail =
    budgetRemaining !== null && budgetRemaining < 0
      ? t("usage.budgetExceeded")
      : t("usage.budgetDetail")

  const handleWeeklyBudgetChange = (value: string) => {
    const parsed = Number.parseInt(value, 10)
    setUsageBudget({
      weeklyTokenBudget:
        Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0,
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={500} open={open ? false : undefined}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("usage.title")}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring/70"
            >
              <BarChart3 className="h-4 w-4" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("usage.title")}</TooltipContent>
      </Tooltip>

      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-[320px] p-3"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              {t("usage.title")}
            </div>
            <div className="text-[11px] leading-4 text-muted-foreground">
              {t("usage.subtitle")}
            </div>
          </div>
          <div
            className={cn(
              "h-2 w-2 rounded-full mt-1.5",
              usageQuery.isFetching ? "bg-amber-500" : "bg-emerald-500",
            )}
          />
        </div>

        <div className="mt-2 border-t border-border/50">
          <SectionTitle>{t("usage.localObserved")}</SectionTitle>
          <MetricRow
            label={t("usage.currentConversation")}
            value={formatTokens(usage?.currentConversation.totalTokens ?? 0)}
            detail={
              usage
                ? formatInputOutput(
                    usage.currentConversation,
                    t("usage.inputShort"),
                    t("usage.outputShort"),
                  )
                : ""
            }
          />
          <MetricRow
            label={t("usage.currentWorkspace")}
            value={formatTokens(usage?.currentWorkspace.totalTokens ?? 0)}
            detail={
              usage
                ? formatInputOutput(
                    usage.currentWorkspace,
                    t("usage.inputShort"),
                    t("usage.outputShort"),
                  )
                : ""
            }
          />
          <MetricRow
            label={t("usage.today")}
            value={formatTokens(usage?.today.totalTokens ?? 0)}
            detail={
              usage
                ? formatInputOutput(
                    usage.today,
                    t("usage.inputShort"),
                    t("usage.outputShort"),
                  )
                : ""
            }
          />
          <MetricRow
            label={t("usage.last7Days")}
            value={formatTokens(usage?.last7Days.totalTokens ?? 0)}
            detail={
              usage
                ? formatInputOutput(
                    usage.last7Days,
                    t("usage.inputShort"),
                    t("usage.outputShort"),
                  )
                : ""
            }
          />
          <MetricRow
            label={t("usage.context")}
            value={contextValue}
            detail={contextDetail}
          />
          {estimatedCost > 0 && (
            <MetricRow
              label={t("usage.estimatedCost")}
              value={formatCost(estimatedCost)}
              detail={t("usage.providerReported")}
            />
          )}
        </div>

        <div className="mt-2 border-t border-border/50">
          <SectionTitle>{t("usage.localBudget")}</SectionTitle>
          <div className="flex items-center justify-between gap-3 py-1">
            <label
              htmlFor="usage-weekly-token-budget"
              className="text-xs text-muted-foreground"
            >
              {t("usage.weeklyTokenBudget")}
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="usage-weekly-token-budget"
                type="number"
                min={0}
                step={1000}
                value={weeklyBudgetTokens || ""}
                onChange={(event) =>
                  handleWeeklyBudgetChange(event.currentTarget.value)
                }
                placeholder="0"
                className="h-6 w-24 rounded-md border border-border bg-background px-2 text-right font-mono text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-ring"
              />
              <span className="text-[10px] text-muted-foreground/60">
                {t("usage.tokensUnit")}
              </span>
            </div>
          </div>
          <MetricRow
            label={t("usage.estimatedRemaining")}
            value={
              budgetRemaining === null
                ? t("usage.budgetUnset")
                : formatSignedTokens(budgetRemaining)
            }
            detail={budgetRemainingDetail}
          />
          {weeklyBudgetTokens > 0 && <BudgetProgress percent={budgetPercent} />}
        </div>

        <div className="mt-2 border-t border-border/50">
          <SectionTitle>{t("usage.limitedProviders")}</SectionTitle>
          <ProviderRow
            label="Claude Code OAuth"
            status={claudeStatus}
            quota={t("usage.remainingUnavailable")}
            href={CLAUDE_USAGE_URL}
          />
          <ProviderRow
            label="Codex"
            status={codexStatus}
            quota={t("usage.remainingUnavailable")}
            href={CODEX_USAGE_URL}
          />
          <p className="pt-2 text-[11px] leading-4 text-muted-foreground/70">
            {t("usage.providerNote")}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
})
