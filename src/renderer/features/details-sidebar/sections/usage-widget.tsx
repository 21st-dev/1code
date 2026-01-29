"use client"

import { memo, useState, useCallback } from "react"
import { RefreshCw, AlertCircle, Gauge, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"

/**
 * Get status level based on percentage
 * - green (safe): < 50%
 * - orange (moderate): 50-80%
 * - red (critical): > 80%
 */
function getStatusLevel(percentage: number): "safe" | "moderate" | "critical" {
  if (percentage < 50) return "safe"
  if (percentage < 80) return "moderate"
  return "critical"
}

/**
 * Get color classes based on status level
 */
function getStatusColor(status: "safe" | "moderate" | "critical"): string {
  switch (status) {
    case "safe":
      return "bg-muted-foreground/60"
    case "moderate":
      return "bg-orange-500"
    case "critical":
      return "bg-red-500"
  }
}

/**
 * Format reset time as "Resets in X" or "Resets Monday 12:59 PM"
 */
function formatResetTime(isoString: string | null): string {
  if (!isoString) return ""

  try {
    const resetDate = new Date(isoString)
    const now = new Date()
    const diffMs = resetDate.getTime() - now.getTime()

    if (diffMs < 0) return "Resets now"

    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    // For times under 24 hours, show relative time
    if (diffDays === 0) {
      if (diffHours > 0) {
        const remainingMins = diffMins % 60
        return remainingMins > 0
          ? `Resets in ${diffHours}h ${remainingMins}m`
          : `Resets in ${diffHours}h`
      }
      return `Resets in ${diffMins}m`
    }

    // For times over 24 hours, show day and time
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    const day = dayNames[resetDate.getDay()]
    const hours = resetDate.getHours()
    const minutes = resetDate.getMinutes()
    const ampm = hours >= 12 ? "PM" : "AM"
    const hour12 = hours % 12 || 12
    const timeStr = minutes > 0
      ? `${hour12}:${minutes.toString().padStart(2, "0")} ${ampm}`
      : `${hour12} ${ampm}`

    return `Resets ${day} ${timeStr}`
  } catch {
    return ""
  }
}

/**
 * Progress bar component with color coding
 */
const UsageProgressBar = ({
  percentage,
  label,
  resetTime,
}: {
  percentage: number
  label: string
  resetTime: string | null
}) => {
  const status = getStatusLevel(percentage)
  const colorClass = getStatusColor(status)
  const resetLabel = formatResetTime(resetTime)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-medium tabular-nums">{Math.round(percentage)}%</span>
      </div>
      <div className="h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", colorClass)}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {resetLabel && (
        <span className="text-[10px] text-muted-foreground/60">{resetLabel}</span>
      )}
    </div>
  )
}

/**
 * Usage Widget for Overview Sidebar
 * Displays Claude Code usage stats with progress bars
 */
export const UsageWidget = memo(function UsageWidget() {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isModelExpanded, setIsModelExpanded] = useState(true)

  // Fetch usage data - always try, backend returns error if not connected
  const { data: result, refetch, isLoading } = trpc.claudeUsage.getUsage.useQuery(undefined, {
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 30 * 1000, // Consider data stale after 30 seconds
    refetchOnMount: "always", // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  })

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await refetch()
    } finally {
      setIsRefreshing(false)
    }
  }, [refetch])

  const usageData = result?.data
  const error = result?.error

  // Show nothing if not connected (don't clutter sidebar)
  if (!isLoading && !usageData && error === "Not connected to Claude Code") {
    return null
  }

  return (
    <div className="mx-2 mb-2">
      <div className="rounded-lg border border-border/50 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-2 h-8 bg-muted/30 group">
          <Gauge className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-medium text-foreground flex-1">Usage</span>

          {/* Refresh button */}
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || isLoading}
            className={cn(
              "p-1 rounded-md hover:bg-foreground/10 text-muted-foreground hover:text-foreground",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            aria-label="Refresh usage"
          >
            <RefreshCw
              className={cn(
                "h-3 w-3",
                (isRefreshing || isLoading) && "animate-spin"
              )}
            />
          </button>
        </div>

        {/* Content */}
        <div className="px-3 py-2 space-y-3">
          {/* Loading state */}
          {isLoading && !usageData && (
            <div className="flex items-center gap-2 py-2">
              <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Loading usage...</span>
            </div>
          )}

          {/* Error state */}
          {error && !usageData && (
            <div className="flex items-start gap-2 py-1">
              <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0 mt-0.5" />
              <span className="text-xs text-destructive">{error}</span>
            </div>
          )}

          {/* Usage data */}
          {usageData && (
            <>
              {/* 5-hour session usage */}
              <UsageProgressBar
                percentage={usageData.fiveHour.utilization}
                label="Session (5h)"
                resetTime={usageData.fiveHour.resetsAt}
              />

              {/* 7-day weekly usage */}
              <UsageProgressBar
                percentage={usageData.sevenDay.utilization}
                label="Weekly"
                resetTime={usageData.sevenDay.resetsAt}
              />

              {/* Model breakdown - expandable */}
              <div className="pt-1 border-t border-border/30">
                <button
                  onClick={() => setIsModelExpanded(!isModelExpanded)}
                  className="flex items-center gap-1 w-full text-left hover:bg-muted/30 rounded px-1 py-0.5 -mx-1 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 text-muted-foreground/70 transition-transform duration-200",
                      !isModelExpanded && "-rotate-90"
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
                    By Model
                  </span>
                </button>
                {isModelExpanded && (
                  <div className="space-y-2 mt-2">
                    <UsageProgressBar
                      percentage={usageData.sevenDayOpus.utilization}
                      label="Opus"
                      resetTime={null}
                    />
                    <UsageProgressBar
                      percentage={usageData.sevenDaySonnet.utilization}
                      label="Sonnet"
                      resetTime={usageData.sevenDaySonnet.resetsAt}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
})
