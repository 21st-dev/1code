import { useMemo } from "react"
import { cn } from "../../../lib/utils"
import { formatCompact, formatShortDate } from "../lib/format"

export type HeatmapCell = {
  date: string
  dayOfWeek: number
  weekIndex: number
  totalTokens: number
}

type Props = {
  cells: HeatmapCell[]
  className?: string
}

const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""]
const CELL = 12
const GAP = 3

function bucketFor(value: number, thresholds: number[]): number {
  if (value <= 0) return 0
  for (let i = 0; i < thresholds.length; i += 1) {
    if (value <= thresholds[i]!) return i + 1
  }
  return thresholds.length
}

export function ActivityHeatmap({ cells, className }: Props) {
  const { weekCount, thresholds } = useMemo(() => {
    const maxWeek = cells.reduce((m, c) => Math.max(m, c.weekIndex), 0)
    const values = cells.map((c) => c.totalTokens).filter((v) => v > 0).sort((a, b) => a - b)
    // 4 thresholds ≈ quartiles, so we end up with 5 intensity levels including 0.
    const t: number[] = []
    if (values.length > 0) {
      for (const q of [0.25, 0.5, 0.75, 0.95]) {
        const idx = Math.min(values.length - 1, Math.floor(values.length * q))
        t.push(values[idx]!)
      }
    }
    return { weekCount: maxWeek + 1, thresholds: t }
  }, [cells])

  const width = weekCount * (CELL + GAP) + 24
  const height = 7 * (CELL + GAP) + 20

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="text-xs text-muted-foreground font-medium">Activity</div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Daily activity heatmap">
          {DAY_LABELS.map((label, i) => (
            <text
              key={i}
              x={0}
              y={i * (CELL + GAP) + CELL - 2}
              className="fill-muted-foreground"
              fontSize={9}
            >
              {label}
            </text>
          ))}
          {cells.map((c) => {
            const level = bucketFor(c.totalTokens, thresholds)
            const x = 24 + c.weekIndex * (CELL + GAP)
            const y = c.dayOfWeek * (CELL + GAP)
            const opacity = level === 0 ? 0.08 : 0.2 + level * 0.2
            return (
              <rect
                key={`${c.date}-${c.weekIndex}-${c.dayOfWeek}`}
                x={x}
                y={y}
                width={CELL}
                height={CELL}
                rx={2}
                className="fill-foreground"
                opacity={opacity}
              >
                <title>
                  {formatShortDate(c.date)} — {formatCompact(c.totalTokens)} tokens
                </title>
              </rect>
            )
          })}
        </svg>
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground justify-end">
        <span>Less</span>
        {[0.08, 0.3, 0.5, 0.7, 0.9].map((o, i) => (
          <span
            key={i}
            className="inline-block w-3 h-3 rounded-sm bg-foreground"
            style={{ opacity: o }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
