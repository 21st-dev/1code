import { cn } from "../../../lib/utils"
import { formatCompact, formatFull } from "../lib/format"

type StatCardProps = {
  label: string
  value: number
  /** When true, renders a $ prefix and uses two decimals. */
  currency?: boolean
  /** Override the auto-formatted value with a pre-formatted string. */
  valueOverride?: string
  className?: string
}

export function StatCard({ label, value, currency, valueOverride, className }: StatCardProps) {
  const display =
    valueOverride ??
    (currency ? `$${value.toFixed(2)}` : formatCompact(value))
  const title = currency ? `$${value.toFixed(2)}` : formatFull(value)
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-background px-4 py-3 flex flex-col gap-1",
        className,
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums" title={title}>
        {display}
      </div>
    </div>
  )
}
