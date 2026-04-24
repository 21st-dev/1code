import { useMemo } from "react"
import { cn } from "../../../lib/utils"
import { formatShortDate, formatUSD } from "../lib/format"

export type DailyBucket = {
  date: string
  costUSD: number
  totalTokens: number
}

type Props = {
  daily: DailyBucket[]
  className?: string
}

const HEIGHT = 160
const BAR_GAP = 2
const BAR_MIN = 4
const LEFT_PAD = 4
const RIGHT_PAD = 4

export function DailyCostChart({ daily, className }: Props) {
  const { max, tickIndices } = useMemo(() => {
    let m = 0
    for (const d of daily) m = Math.max(m, d.costUSD)
    // Tick positions: first, last, and every ~7th in between.
    const ticks: number[] = []
    if (daily.length > 0) {
      ticks.push(0)
      for (let i = 7; i < daily.length - 1; i += 7) ticks.push(i)
      if (daily.length > 1) ticks.push(daily.length - 1)
    }
    return { max: m, tickIndices: ticks }
  }, [daily])

  const barWidth = 10
  const innerWidth = LEFT_PAD + RIGHT_PAD + daily.length * (barWidth + BAR_GAP)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="text-xs text-muted-foreground font-medium">Daily Cost</div>
      <div className="overflow-x-auto">
        <svg
          width={Math.max(innerWidth, 200)}
          height={HEIGHT + 24}
          role="img"
          aria-label="Daily cost bar chart"
        >
          {daily.map((d, i) => {
            const h = max > 0 ? Math.max(BAR_MIN, (d.costUSD / max) * HEIGHT) : 0
            const x = LEFT_PAD + i * (barWidth + BAR_GAP)
            const y = HEIGHT - h
            return (
              <rect
                key={d.date}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={1.5}
                className="fill-foreground"
                opacity={d.costUSD > 0 ? 0.9 : 0.1}
              >
                <title>
                  {formatShortDate(d.date)} — {formatUSD(d.costUSD)}
                </title>
              </rect>
            )
          })}
          {tickIndices.map((i) => {
            const d = daily[i]
            if (!d) return null
            const x = LEFT_PAD + i * (barWidth + BAR_GAP) + barWidth / 2
            return (
              <text
                key={`tick-${i}`}
                x={x}
                y={HEIGHT + 14}
                textAnchor="middle"
                fontSize={10}
                className="fill-muted-foreground"
              >
                {formatShortDate(d.date)}
              </text>
            )
          })}
        </svg>
      </div>
    </div>
  )
}
