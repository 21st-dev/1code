import { useAtom, useSetAtom } from "jotai"
import { useEffect } from "react"
import {
  desktopViewAtom,
  usagePeriodAtom,
  usageSourceAtom,
  agentsSidebarOpenAtom,
  type UsagePeriod,
  type UsageSourceFilter,
} from "../agents/atoms"
import { trpc } from "../../lib/trpc"
import { StatCard } from "./components/stat-card"
import { SegmentedToggle } from "./components/segmented-toggle"
import { ActivityHeatmap } from "./components/activity-heatmap"
import { DailyCostChart } from "./components/daily-cost-chart"
import { ModelBreakdown } from "./components/model-breakdown"
import { formatCompact, formatUSD } from "./lib/format"
import { RefreshCw, AlignJustify } from "lucide-react"
import { useIsMobile } from "../../lib/hooks/use-mobile"
import { AgentsHeaderControls } from "../agents/ui/agents-header-controls"
import { Button } from "../../components/ui/button"

const PERIOD_OPTIONS: { value: UsagePeriod; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
]

const SOURCE_OPTIONS: { value: UsageSourceFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
]

export function UsageContent() {
  const [period, setPeriod] = useAtom(usagePeriodAtom)
  const [source, setSource] = useAtom(usageSourceAtom)
  const setDesktopView = useSetAtom(desktopViewAtom)
  const [sidebarOpen, setSidebarOpen] = useAtom(agentsSidebarOpenAtom)
  const isMobile = useIsMobile()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        setDesktopView(null)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [setDesktopView])

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = trpc.usage.getOverview.useQuery(
    { period, source },
    { staleTime: 15_000, refetchOnWindowFocus: false },
  )

  const refreshMutation = trpc.usage.refresh.useMutation({
    onSuccess: () => {
      refetch()
    },
  })

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header bar — mirrors kanban layout */}
      <div className="flex-shrink-0 flex items-center p-1.5">
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDesktopView(null)}
            className="h-6 w-6 p-0 hover:bg-foreground/10 transition-[background-color,transform] duration-150 ease-out active:scale-[0.97] text-foreground flex-shrink-0 rounded-md"
            aria-label="Back"
          >
            <AlignJustify className="h-4 w-4" />
          </Button>
        ) : (
          <AgentsHeaderControls
            isSidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          />
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Usage</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggregated from local Claude Code and Codex CLI session logs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SegmentedToggle
              value={source}
              onChange={setSource}
              options={SOURCE_OPTIONS}
              size="sm"
            />
            <SegmentedToggle
              value={period}
              onChange={setPeriod}
              options={PERIOD_OPTIONS}
              size="sm"
            />
            <button
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending || isFetching}
              className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {isError ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 text-destructive-foreground px-4 py-3 text-sm">
            Failed to load usage: {error?.message ?? "unknown error"}
          </div>
        ) : null}

        {isLoading || !data ? (
          <LoadingSkeleton />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Input" value={data.totals.inputTokens} />
              <StatCard label="Output" value={data.totals.outputTokens} />
              <StatCard label="Cache Read" value={data.totals.cacheReadTokens} />
              <StatCard label="Cache Write" value={data.totals.cacheWriteTokens} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard
                label="Total Tokens"
                value={data.totals.totalTokens}
                className="lg:col-span-1"
              />
              <StatCard
                label="Total Cost"
                value={data.totals.costUSD}
                currency
                valueOverride={formatUSD(data.totals.costUSD)}
                className="lg:col-span-1"
              />
              <StatCard
                label="Messages"
                value={data.entryCount}
                valueOverride={formatCompact(data.entryCount)}
                className="lg:col-span-1"
              />
              <StatCard
                label="Range"
                value={0}
                valueOverride={`${data.rangeStart} → ${data.rangeEnd}`}
                className="lg:col-span-1 [&_.tabular-nums]:text-sm [&_.tabular-nums]:font-medium"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-background p-4">
                <ActivityHeatmap cells={data.heatmap} />
              </div>
              <div className="rounded-lg border border-border bg-background p-4">
                <DailyCostChart daily={data.daily} />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-background p-4">
              <div className="text-sm font-medium mb-2">Models</div>
              <ModelBreakdown rows={data.models} />
            </div>

            {data.totals.unpricedModels.length > 0 ? (
              <div className="text-xs text-muted-foreground">
                Unpriced models (tokens shown, cost omitted):{" "}
                {data.totals.unpricedModels.join(", ")}
              </div>
            ) : null}
          </>
        )}
      </div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-4 animate-pulse">
      <div className="grid grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-lg border border-border bg-muted/20" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="h-48 rounded-lg border border-border bg-muted/20" />
        <div className="h-48 rounded-lg border border-border bg-muted/20" />
      </div>
      <div className="h-40 rounded-lg border border-border bg-muted/20" />
    </div>
  )
}
