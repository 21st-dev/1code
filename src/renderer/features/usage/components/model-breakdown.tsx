import { useMemo } from "react"
import { cn } from "../../../lib/utils"
import { formatCompact, formatUSD } from "../lib/format"

export type ModelRow = {
  model: string
  displayName: string
  provider: "claude" | "codex" | "unknown"
  totalTokens: number
  costUSD: number
  priced: boolean
}

type Props = {
  rows: ModelRow[]
  className?: string
}

const PROVIDER_DOT: Record<ModelRow["provider"], string> = {
  claude: "bg-[#d97757]",
  codex: "bg-emerald-500",
  unknown: "bg-muted-foreground",
}

export function ModelBreakdown({ rows, className }: Props) {
  const maxTokens = useMemo(
    () => rows.reduce((m, r) => Math.max(m, r.totalTokens), 0),
    [rows],
  )

  if (rows.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground py-6 text-center", className)}>
        No model usage recorded in this range.
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 text-xs text-muted-foreground font-medium py-2 border-b border-border">
        <div>Model</div>
        <div className="text-right">Tokens</div>
        <div className="text-right">Cost</div>
        <div>Usage</div>
      </div>
      {rows.map((row) => {
        const pct = maxTokens > 0 ? (row.totalTokens / maxTokens) * 100 : 0
        return (
          <div
            key={row.model}
            className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 items-center py-2 text-sm border-b border-border/50 last:border-b-0"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={cn("w-1.5 h-1.5 rounded-full shrink-0", PROVIDER_DOT[row.provider])}
              />
              <span className="truncate" title={row.model}>
                {row.displayName}
              </span>
            </div>
            <div className="text-right tabular-nums" title={row.totalTokens.toLocaleString()}>
              {formatCompact(row.totalTokens)}
            </div>
            <div className="text-right tabular-nums">
              {row.priced ? formatUSD(row.costUSD) : <span className="text-muted-foreground">—</span>}
            </div>
            <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full bg-foreground/70 rounded-full"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
