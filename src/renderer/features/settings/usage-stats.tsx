"use client"

import { trpc } from "../../lib/trpc"
import { IconSpinner } from "../../components/ui/icons"
import { AlertCircle } from "lucide-react"

interface UsageBarProps {
  label: string
  percentage: number
  resetLabel: string | null
}

function UsageBar({ label, percentage, resetLabel }: UsageBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-foreground font-medium text-sm">{label}</span>
        <span className="text-muted-foreground text-sm">
          {percentage}% used
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300 rounded-full bg-violet-400"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {resetLabel && (
        <div className="text-xs text-muted-foreground">
          {resetLabel}
        </div>
      )}
    </div>
  )
}

export function UsageStats() {
  const { data: usage, isLoading, error } = trpc.usage.getCurrentUsage.useQuery(
    undefined,
    { refetchInterval: 30000 }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <IconSpinner className="h-5 w-5" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500 py-4">
        <AlertCircle className="h-4 w-4" />
        <span>Error: {error.message}</span>
      </div>
    )
  }

  if (!usage || usage.source === "unavailable") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <AlertCircle className="h-4 w-4" />
        <span>{usage?.error || "Usage data unavailable"}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {usage.session && (
        <UsageBar
          label="Current session"
          percentage={usage.session.percentage}
          resetLabel={usage.session.resetLabel}
        />
      )}

      {usage.weekly && (
        <UsageBar
          label="Current week (all models)"
          percentage={usage.weekly.percentage}
          resetLabel={usage.weekly.resetLabel}
        />
      )}

      {usage.opus && (
        <UsageBar
          label="Opus (weekly)"
          percentage={usage.opus.percentage}
          resetLabel={null}
        />
      )}
    </div>
  )
}
