import { useAtom, useSetAtom } from "jotai"
import { BarChart3, ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react"
import React, { useEffect, useState } from "react"
import { toast } from "sonner"
import { UsageDetailsDialog } from "./usage-details-dialog"
import {
  agentsSettingsDialogOpenAtom,
  anthropicOnboardingCompletedAtom,
  customClaudeConfigAtom,
  openaiApiKeyAtom,
  type CustomClaudeConfig,
} from "../../../lib/atoms"
import { trpc } from "../../../lib/trpc"
import { Badge } from "../../ui/badge"
import { Button } from "../../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../ui/dropdown-menu"
import { Input } from "../../ui/input"
import { Label } from "../../ui/label"

// Hook to detect narrow screen
function useIsNarrowScreen(): boolean {
  const [isNarrow, setIsNarrow] = useState(false)

  useEffect(() => {
    const checkWidth = () => {
      setIsNarrow(window.innerWidth <= 768)
    }

    checkWidth()
    window.addEventListener("resize", checkWidth)
    return () => window.removeEventListener("resize", checkWidth)
  }, [])

  return isNarrow
}

const EMPTY_CONFIG: CustomClaudeConfig = {
  model: "",
  token: "",
  baseUrl: "",
}

// Account row component
function AccountRow({
  account,
  isActive,
  onSetActive,
  onRename,
  onRemove,
  isLoading,
}: {
  account: {
    id: string
    displayName: string | null
    email: string | null
    connectedAt: string | null
  }
  isActive: boolean
  onSetActive: () => void
  onRename: () => void
  onRemove: () => void
  isLoading: boolean
}) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50">
      <div className="flex items-center gap-3">
        <div>
          <div className="text-sm font-medium">
            {account.displayName || "Anthropic Account"}
          </div>
          {account.email && (
            <div className="text-xs text-muted-foreground">{account.email}</div>
          )}
          {!account.email && account.connectedAt && (
            <div className="text-xs text-muted-foreground">
              Connected{" "}
              {new Date(account.connectedAt).toLocaleDateString(undefined, {
                dateStyle: "short",
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!isActive && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onSetActive}
            disabled={isLoading}
          >
            Switch
          </Button>
        )}
        {isActive && (
          <Badge variant="secondary" className="text-xs">
            Active
          </Badge>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem
              className="data-[highlighted]:bg-red-500/15 data-[highlighted]:text-red-400"
              onClick={onRemove}
            >
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// Anthropic accounts section component
function AnthropicAccountsSection() {
  const { data: accounts, isLoading: isAccountsLoading, refetch: refetchList } =
    trpc.anthropicAccounts.list.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: activeAccount, refetch: refetchActive } =
    trpc.anthropicAccounts.getActive.useQuery(undefined, {
      refetchOnMount: true,
      staleTime: 0,
    })
  const { data: claudeCodeIntegration } = trpc.claudeCode.getIntegration.useQuery()
  const trpcUtils = trpc.useUtils()

  // Auto-migrate legacy account if needed
  const migrateLegacy = trpc.anthropicAccounts.migrateLegacy.useMutation({
    onSuccess: async () => {
      await refetchList()
      await refetchActive()
    },
  })

  // Trigger migration if: no accounts, not loading, has legacy connection, not already migrating
  useEffect(() => {
    if (
      !isAccountsLoading &&
      accounts?.length === 0 &&
      claudeCodeIntegration?.isConnected &&
      !migrateLegacy.isPending &&
      !migrateLegacy.isSuccess
    ) {
      migrateLegacy.mutate()
    }
  }, [isAccountsLoading, accounts, claudeCodeIntegration, migrateLegacy])

  const setActiveMutation = trpc.anthropicAccounts.setActive.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account switched")
    },
    onError: (err) => {
      toast.error(`Failed to switch account: ${err.message}`)
    },
  })

  const renameMutation = trpc.anthropicAccounts.rename.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      toast.success("Account renamed")
    },
    onError: (err) => {
      toast.error(`Failed to rename account: ${err.message}`)
    },
  })

  const removeMutation = trpc.anthropicAccounts.remove.useMutation({
    onSuccess: () => {
      trpcUtils.anthropicAccounts.list.invalidate()
      trpcUtils.anthropicAccounts.getActive.invalidate()
      trpcUtils.claudeCode.getIntegration.invalidate()
      toast.success("Account removed")
    },
    onError: (err) => {
      toast.error(`Failed to remove account: ${err.message}`)
    },
  })

  const handleRename = (accountId: string, currentName: string | null) => {
    const newName = window.prompt(
      "Enter new name for this account:",
      currentName || "Anthropic Account"
    )
    if (newName && newName.trim()) {
      renameMutation.mutate({ accountId, displayName: newName.trim() })
    }
  }

  const handleRemove = (accountId: string, displayName: string | null) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove "${displayName || "this account"}"? You will need to re-authenticate to use it again.`
    )
    if (confirmed) {
      removeMutation.mutate({ accountId })
    }
  }

  const isLoading =
    setActiveMutation.isPending ||
    renameMutation.isPending ||
    removeMutation.isPending

  // Don't show section if no accounts
  if (!isAccountsLoading && (!accounts || accounts.length === 0)) {
    return null
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden divide-y divide-border">
        {isAccountsLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading accounts...
          </div>
        ) : (
          accounts?.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              isActive={activeAccount?.id === account.id}
              onSetActive={() => setActiveMutation.mutate({ accountId: account.id })}
              onRename={() => handleRename(account.id, account.displayName)}
              onRemove={() => handleRemove(account.id, account.displayName)}
              isLoading={isLoading}
            />
          ))
        )}
    </div>
  )
}

// Helper to format token count
function formatTokenCount(tokens: number): string {
  if (!tokens) return "0"
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return String(tokens)
}

// Helper to format cost
function formatCost(cost: number): string {
  if (!cost) return "$0.00"
  return `$${cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}`
}

// GitHub-style contribution heatmap component (auto-fit width with navigation)
function ContributionHeatmap() {
  const { data: activity } = trpc.usage.getDailyActivity.useQuery()
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [numWeeks, setNumWeeks] = useState(20) // Default, will be calculated
  const [pageOffset, setPageOffset] = useState(0) // 0 = current, 1 = previous page, etc.
  const [slideDirection, setSlideDirection] = useState<"left" | "right" | null>(null)

  // Calculate how many weeks fit in the container
  useEffect(() => {
    const calculateWeeks = () => {
      if (!containerRef.current) return
      const containerWidth = containerRef.current.offsetWidth
      // Each week column: 10px cell + 2px gap = 12px
      const cellSize = 10
      const gap = 2
      const weekWidth = cellSize + gap
      const availableWidth = containerWidth - 8 // Small padding
      const weeks = Math.floor(availableWidth / weekWidth)
      setNumWeeks(Math.max(weeks, 4)) // Minimum 4 weeks
    }

    calculateWeeks()
    window.addEventListener("resize", calculateWeeks)
    return () => window.removeEventListener("resize", calculateWeeks)
  }, [])

  // Reset slide direction after animation
  useEffect(() => {
    if (slideDirection) {
      const timer = setTimeout(() => setSlideDirection(null), 300)
      return () => clearTimeout(timer)
    }
  }, [slideDirection])

  // Build activity map for quick lookup
  const activityMap = new Map<string, { count: number; totalTokens: number }>()
  activity?.forEach((d) => {
    activityMap.set(d.date, { count: d.count, totalTokens: d.totalTokens })
  })

  // Generate days based on calculated weeks and page offset
  const today = new Date()
  const days: { date: string; count: number; totalTokens: number }[] = []

  // Calculate end date based on page offset
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() - pageOffset * numWeeks * 7)

  // Calculate start date: go back numWeeks weeks from endDate, align to Sunday
  const daysToGoBack = (numWeeks - 1) * 7 + endDate.getDay()
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - daysToGoBack)

  for (let i = 0; i <= daysToGoBack + (6 - endDate.getDay()); i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    if (d > endDate || d > today) break

    const dateStr = d.toISOString().split("T")[0]!
    const data = activityMap.get(dateStr)
    days.push({
      date: dateStr,
      count: data?.count || 0,
      totalTokens: data?.totalTokens || 0,
    })
  }

  // Find max for color scaling
  const maxCount = Math.max(...days.map((d) => d.count), 1)

  // Get color intensity (0-4 levels like GitHub)
  const getLevel = (count: number): number => {
    if (count === 0) return 0
    const ratio = count / maxCount
    if (ratio <= 0.25) return 1
    if (ratio <= 0.5) return 2
    if (ratio <= 0.75) return 3
    return 4
  }

  // Colors for each level (GitHub green theme)
  const levelColors = [
    "bg-muted/30", // level 0 - no activity
    "bg-emerald-900/50", // level 1
    "bg-emerald-700/70", // level 2
    "bg-emerald-500/80", // level 3
    "bg-emerald-400", // level 4
  ]

  // Group days into weeks (columns)
  const weeks: typeof days[] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }

  // Month labels - show at most every 4 weeks to avoid crowding
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const monthLabels: { label: string; weekIndex: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, weekIndex) => {
    const firstDay = week[0]
    if (firstDay) {
      const month = new Date(firstDay.date).getMonth()
      if (month !== lastMonth) {
        // Only add label if there's enough space from the last one
        const lastLabel = monthLabels[monthLabels.length - 1]
        if (!lastLabel || weekIndex - lastLabel.weekIndex >= 3) {
          monthLabels.push({ label: months[month]!, weekIndex })
        }
        lastMonth = month
      }
    }
  })

  // Calculate total contributions for this view
  const totalContributions = days.reduce((sum, d) => sum + d.count, 0)

  // Check if there's older data available (max ~52 weeks back)
  const maxPages = Math.floor(52 / Math.max(numWeeks, 1))
  const canGoBack = pageOffset < maxPages
  const canGoForward = pageOffset > 0

  // Navigation handlers with slide animation
  const goBack = () => {
    if (canGoBack) {
      setSlideDirection("right")
      setPageOffset((p) => p + 1)
    }
  }

  const goForward = () => {
    if (canGoForward) {
      setSlideDirection("left")
      setPageOffset((p) => p - 1)
    }
  }

  // Slide animation classes
  const getSlideClass = () => {
    if (!slideDirection) return ""
    return slideDirection === "left"
      ? "animate-slide-in-left"
      : "animate-slide-in-right"
  }

  return (
    <div ref={containerRef} className="space-y-1">
      {/* Inline styles for slide animations */}
      <style>{`
        @keyframes slideInLeft {
          from { transform: translateX(30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideInRight {
          from { transform: translateX(-30px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-left { animation: slideInLeft 0.25s ease-out; }
        .animate-slide-in-right { animation: slideInRight 0.25s ease-out; }
      `}</style>

      {/* Header with navigation */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{totalContributions.toLocaleString()} contributions</span>
        <div className="flex items-center gap-1">
          <button
            onClick={goBack}
            disabled={!canGoBack}
            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="View older"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[140px] text-center text-[10px]">
            {days[0]?.date} ~ {days[days.length - 1]?.date}
          </span>
          <button
            onClick={goForward}
            disabled={!canGoForward}
            className="p-0.5 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="View newer"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="relative overflow-hidden">
        {/* Month labels */}
        <div className={`flex text-[10px] text-muted-foreground mb-1 h-3 ${getSlideClass()}`}>
          {monthLabels.map((m, i) => (
            <div
              key={i}
              className="absolute"
              style={{ left: `${m.weekIndex * 12}px` }}
            >
              {m.label}
            </div>
          ))}
        </div>

        {/* Grid with slide animation */}
        <div className={`flex gap-[2px] ${getSlideClass()}`} key={pageOffset}>
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[2px]">
              {[0, 1, 2, 3, 4, 5, 6].map((dayIndex) => {
                const day = week[dayIndex]
                if (!day) return <div key={dayIndex} className="w-[10px] h-[10px]" />

                const level = getLevel(day.count)
                return (
                  <div
                    key={dayIndex}
                    className={`w-[10px] h-[10px] rounded-[2px] ${levelColors[level]} cursor-default transition-colors hover:ring-1 hover:ring-foreground/30`}
                    title={`${day.date}: ${day.count} requests, ${formatTokenCount(day.totalTokens)} tokens`}
                  />
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {levelColors.map((color, i) => (
            <div key={i} className={`w-[10px] h-[10px] rounded-[2px] ${color}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

// Usage Statistics Section component
function UsageStatisticsSection({ onViewDetails }: { onViewDetails: () => void }) {
  const { data: summary, isLoading } = trpc.usage.getSummary.useQuery()

  if (isLoading) {
    return (
      <div className="bg-background rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
        Loading usage statistics...
      </div>
    )
  }

  return (
    <div className="bg-background rounded-lg border border-border overflow-hidden">
      <div className="p-4 space-y-4">
        {/* Contribution Heatmap - at top */}
        <ContributionHeatmap />

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Today</div>
            <div className="text-lg font-semibold">
              {formatTokenCount(summary?.today?.totalTokens || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCost(summary?.today?.totalCostUsd || 0)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">This Week</div>
            <div className="text-lg font-semibold">
              {formatTokenCount(summary?.week?.totalTokens || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCost(summary?.week?.totalCostUsd || 0)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">This Month</div>
            <div className="text-lg font-semibold">
              {formatTokenCount(summary?.month?.totalTokens || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCost(summary?.month?.totalCostUsd || 0)}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">All Time</div>
            <div className="text-lg font-semibold">
              {formatTokenCount(summary?.total?.totalTokens || 0)}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatCost(summary?.total?.totalCostUsd || 0)}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-muted p-3 rounded-b-lg flex justify-end border-t">
        <Button size="sm" variant="outline" onClick={onViewDetails}>
          <BarChart3 className="h-3 w-3 mr-1" />
          View Details
        </Button>
      </div>
    </div>
  )
}

export function AgentsModelsTab() {
  const [storedConfig, setStoredConfig] = useAtom(customClaudeConfigAtom)
  const [model, setModel] = useState(storedConfig.model)
  const [baseUrl, setBaseUrl] = useState(storedConfig.baseUrl)
  const [token, setToken] = useState(storedConfig.token)
  const setAnthropicOnboardingCompleted = useSetAtom(
    anthropicOnboardingCompletedAtom,
  )
  const setSettingsOpen = useSetAtom(agentsSettingsDialogOpenAtom)
  const isNarrowScreen = useIsNarrowScreen()
  const disconnectClaudeCode = trpc.claudeCode.disconnect.useMutation()
  const { data: claudeCodeIntegration, isLoading: isClaudeCodeLoading } =
    trpc.claudeCode.getIntegration.useQuery()
  const isClaudeCodeConnected = claudeCodeIntegration?.isConnected

  // Usage details dialog state
  const [usageDetailsOpen, setUsageDetailsOpen] = useState(false)

  // OpenAI API key state
  const [storedOpenAIKey, setStoredOpenAIKey] = useAtom(openaiApiKeyAtom)
  const [openaiKey, setOpenaiKey] = useState(storedOpenAIKey)
  const setOpenAIKeyMutation = trpc.voice.setOpenAIKey.useMutation()
  const trpcUtils = trpc.useUtils()

  useEffect(() => {
    setModel(storedConfig.model)
    setBaseUrl(storedConfig.baseUrl)
    setToken(storedConfig.token)
  }, [storedConfig.model, storedConfig.baseUrl, storedConfig.token])

  useEffect(() => {
    setOpenaiKey(storedOpenAIKey)
  }, [storedOpenAIKey])

  const trimmedModel = model.trim()
  const trimmedBaseUrl = baseUrl.trim()
  const trimmedToken = token.trim()
  const canSave = Boolean(trimmedModel && trimmedBaseUrl && trimmedToken)
  const canReset = Boolean(trimmedModel || trimmedBaseUrl || trimmedToken)

  const handleSave = () => {
    if (!canSave) {
      toast.error("Fill model, token, and base URL to save")
      return
    }
    const nextConfig: CustomClaudeConfig = {
      model: trimmedModel,
      token: trimmedToken,
      baseUrl: trimmedBaseUrl,
    }

    setStoredConfig(nextConfig)
    toast.success("Model settings saved")
  }

  const handleReset = () => {
    setStoredConfig(EMPTY_CONFIG)
    setModel("")
    setBaseUrl("")
    setToken("")
    toast.success("Model settings reset")
  }

  const handleClaudeCodeSetup = () => {
    disconnectClaudeCode.mutate()
    setSettingsOpen(false)
    setAnthropicOnboardingCompleted(false)
  }

  // OpenAI key handlers
  const trimmedOpenAIKey = openaiKey.trim()
  const canSaveOpenAI = trimmedOpenAIKey !== storedOpenAIKey
  const canResetOpenAI = !!trimmedOpenAIKey

  const handleSaveOpenAI = async () => {
    if (trimmedOpenAIKey && !trimmedOpenAIKey.startsWith("sk-")) {
      toast.error("Invalid OpenAI API key format. Key should start with 'sk-'")
      return
    }

    try {
      await setOpenAIKeyMutation.mutateAsync({ key: trimmedOpenAIKey })
      setStoredOpenAIKey(trimmedOpenAIKey)
      // Invalidate voice availability check
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key saved")
    } catch (err) {
      toast.error("Failed to save OpenAI API key")
    }
  }

  const handleResetOpenAI = async () => {
    try {
      await setOpenAIKeyMutation.mutateAsync({ key: "" })
      setStoredOpenAIKey("")
      setOpenaiKey("")
      await trpcUtils.voice.isAvailable.invalidate()
      toast.success("OpenAI API key removed")
    } catch (err) {
      toast.error("Failed to remove OpenAI API key")
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header - hidden on narrow screens since it's in the navigation bar */}
      {!isNarrowScreen && (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Models</h3>
          <p className="text-xs text-muted-foreground">
            Configure model overrides and Claude Code authentication
          </p>
        </div>
      )}

      {/* Anthropic Accounts Section */}
      <div className="space-y-2">
        <div className="pb-2 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-foreground">
              Anthropic Accounts
            </h4>
            <p className="text-xs text-muted-foreground">
              Manage your Claude API accounts
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleClaudeCodeSetup}
            disabled={disconnectClaudeCode.isPending || isClaudeCodeLoading}
          >
            <Plus className="h-3 w-3 mr-1" />
            {isClaudeCodeConnected ? "Add" : "Connect"}
          </Button>
        </div>

        <AnthropicAccountsSection />
      </div>

      {/* Usage Statistics Section */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">
            Usage Statistics
          </h4>
          <p className="text-xs text-muted-foreground">
            Track your token usage and estimated costs
          </p>
        </div>

        <UsageStatisticsSection onViewDetails={() => setUsageDetailsOpen(true)} />
      </div>

      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">
            Override Model
          </h4>
        </div>
        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-6">

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Model name</Label>
              <p className="text-xs text-muted-foreground">
                Model identifier to use for requests
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full"
                placeholder="claude-3-7-sonnet-20250219"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">API token</Label>
              <p className="text-xs text-muted-foreground">
                ANTHROPIC_AUTH_TOKEN env
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                type="password"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value)
                }}
                className="w-full"
                placeholder="sk-ant-..."
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">Base URL</Label>
              <p className="text-xs text-muted-foreground">
                ANTHROPIC_BASE_URL env
              </p>
            </div>
            <div className="flex-shrink-0 w-80">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full"
                placeholder="https://api.anthropic.com"
              />
            </div>
          </div>
        </div>

        <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
          <Button variant="ghost" size="sm" onClick={handleReset} disabled={!canReset} className="hover:bg-red-500/10 hover:text-red-600">
            Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </div>
        </div>
      </div>

      {/* OpenAI API Key for Voice Input */}
      <div className="space-y-2">
        <div className="pb-2">
          <h4 className="text-sm font-medium text-foreground">Voice Input</h4>
        </div>

        <div className="bg-background rounded-lg border border-border overflow-hidden">
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="text-sm font-medium">OpenAI API Key</Label>
                <p className="text-xs text-muted-foreground">
                  Required for voice transcription (Whisper API). Free users need their own key.
                </p>
              </div>
              <div className="flex-shrink-0 w-80">
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  className="w-full"
                  placeholder="sk-..."
                />
              </div>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-b-lg flex justify-end gap-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetOpenAI}
              disabled={!canResetOpenAI || setOpenAIKeyMutation.isPending}
              className="hover:bg-red-500/10 hover:text-red-600"
            >
              Remove
            </Button>
            <Button
              size="sm"
              onClick={handleSaveOpenAI}
              disabled={!canSaveOpenAI || setOpenAIKeyMutation.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </div>

      {/* Usage Details Dialog */}
      <UsageDetailsDialog
        open={usageDetailsOpen}
        onOpenChange={setUsageDetailsOpen}
      />
    </div>
  )
}
