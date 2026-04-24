import { costForTokens, displayNameFor, priceFor } from "./pricing"
import type { UsageEntry, UsagePeriod, UsageSourceFilter } from "./types"

export type UsageTotals = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costUSD: number
  /** Number of entries that couldn't be priced (unknown model). */
  unpricedEntries: number
  /** Model ids seen but missing from the pricing table. */
  unpricedModels: string[]
}

export type DailyBucket = {
  /** Local-date ISO string, YYYY-MM-DD. */
  date: string
  costUSD: number
  totalTokens: number
}

export type ModelBreakdown = {
  /** Raw model id. */
  model: string
  /** Friendly name from pricing table, or the raw id when unknown. */
  displayName: string
  provider: "claude" | "codex" | "unknown"
  totalTokens: number
  costUSD: number
  priced: boolean
}

export type HeatmapCell = {
  /** Local-date ISO string, YYYY-MM-DD. */
  date: string
  /** 0 = Monday ... 6 = Sunday. Matches the layout in the screenshots. */
  dayOfWeek: number
  /** Zero-based column index (0 = oldest week in range). */
  weekIndex: number
  totalTokens: number
}

export type UsageOverview = {
  totals: UsageTotals
  daily: DailyBucket[]
  heatmap: HeatmapCell[]
  models: ModelBreakdown[]
  /** Range actually covered by the data (for labeling). */
  rangeStart: string
  rangeEnd: string
  /** Number of entries considered after dedup + filter. */
  entryCount: number
}

function periodStart(period: UsagePeriod, now: number): number | null {
  if (period === "all") return null
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90
  return now - days * 24 * 60 * 60 * 1000
}

function filterBySource(entries: UsageEntry[], source: UsageSourceFilter): UsageEntry[] {
  if (source === "all") return entries
  return entries.filter((e) => e.source === source)
}

function dedup(entries: UsageEntry[]): UsageEntry[] {
  const seen = new Set<string>()
  const out: UsageEntry[] = []
  for (const e of entries) {
    if (!e.dedupKey) {
      out.push(e)
      continue
    }
    if (seen.has(e.dedupKey)) continue
    seen.add(e.dedupKey)
    out.push(e)
  }
  return out
}

/** YYYY-MM-DD in the local timezone. */
function localDateKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Monday-indexed day of week (0=Mon ... 6=Sun) to match the screenshots. */
function mondayDayOfWeek(ts: number): number {
  const d = new Date(ts).getDay() // 0=Sun..6=Sat
  return (d + 6) % 7
}

function costForEntry(entry: UsageEntry): { cost: number | null } {
  if (typeof entry.costUSD === "number" && entry.costUSD > 0) {
    return { cost: entry.costUSD }
  }
  return {
    cost: costForTokens(entry.model, {
      input: entry.inputTokens,
      output: entry.outputTokens,
      cacheWrite: entry.cacheCreationTokens,
      cacheRead: entry.cacheReadTokens,
    }),
  }
}

/**
 * Reduce a list of entries into the overview payload the UI needs.
 * Entries are expected post-source-filter. Dedup is applied here so callers
 * can freely concatenate Claude + Codex readers without double-counting.
 */
export function aggregate(
  rawEntries: UsageEntry[],
  period: UsagePeriod,
  source: UsageSourceFilter,
  nowMs: number = Date.now(),
): UsageOverview {
  const start = periodStart(period, nowMs)
  const windowed = start === null ? rawEntries : rawEntries.filter((e) => e.ts >= start)
  const scoped = filterBySource(windowed, source)
  const deduped = dedup(scoped)

  const totals: UsageTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    unpricedEntries: 0,
    unpricedModels: [],
  }
  const unpriced = new Set<string>()
  const dailyMap = new Map<string, DailyBucket>()
  const modelMap = new Map<string, ModelBreakdown>()
  let earliest = Infinity
  let latest = -Infinity

  for (const e of deduped) {
    earliest = Math.min(earliest, e.ts)
    latest = Math.max(latest, e.ts)

    totals.inputTokens += e.inputTokens
    totals.outputTokens += e.outputTokens
    totals.cacheReadTokens += e.cacheReadTokens
    totals.cacheWriteTokens += e.cacheCreationTokens

    const entryTokens = e.inputTokens + e.outputTokens + e.cacheReadTokens + e.cacheCreationTokens
    totals.totalTokens += entryTokens

    const { cost } = costForEntry(e)
    if (cost === null) {
      totals.unpricedEntries += 1
      unpriced.add(e.model)
    } else {
      totals.costUSD += cost
    }

    const dayKey = localDateKey(e.ts)
    const bucket = dailyMap.get(dayKey) ?? { date: dayKey, costUSD: 0, totalTokens: 0 }
    bucket.costUSD += cost ?? 0
    bucket.totalTokens += entryTokens
    dailyMap.set(dayKey, bucket)

    const pricing = priceFor(e.model)
    const modelKey = e.model
    const existing = modelMap.get(modelKey) ?? {
      model: modelKey,
      displayName: displayNameFor(modelKey),
      provider: pricing?.provider ?? "unknown",
      totalTokens: 0,
      costUSD: 0,
      priced: pricing !== null,
    }
    existing.totalTokens += entryTokens
    existing.costUSD += cost ?? 0
    modelMap.set(modelKey, existing)
  }

  totals.unpricedModels = Array.from(unpriced).sort()

  // Build full daily series (fill gaps with zero) over the visible range.
  const rangeEndDate = new Date(nowMs)
  const rangeStartDate = start !== null ? new Date(start) : new Date(earliest === Infinity ? nowMs : earliest)
  const daily: DailyBucket[] = []
  const cursor = new Date(rangeStartDate)
  cursor.setHours(0, 0, 0, 0)
  const endCursor = new Date(rangeEndDate)
  endCursor.setHours(0, 0, 0, 0)
  while (cursor.getTime() <= endCursor.getTime()) {
    const key = localDateKey(cursor.getTime())
    daily.push(dailyMap.get(key) ?? { date: key, costUSD: 0, totalTokens: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }

  // Build heatmap grid aligned to weeks. Column 0 = week containing rangeStartDate.
  const heatmap: HeatmapCell[] = []
  const weekAnchor = new Date(rangeStartDate)
  weekAnchor.setHours(0, 0, 0, 0)
  // Align anchor to the Monday of that week.
  weekAnchor.setDate(weekAnchor.getDate() - mondayDayOfWeek(weekAnchor.getTime()))
  for (const bucket of daily) {
    const dayTs = Date.parse(`${bucket.date}T00:00:00`)
    const weekIndex = Math.floor((dayTs - weekAnchor.getTime()) / (7 * 24 * 60 * 60 * 1000))
    heatmap.push({
      date: bucket.date,
      dayOfWeek: mondayDayOfWeek(dayTs),
      weekIndex: Math.max(0, weekIndex),
      totalTokens: bucket.totalTokens,
    })
  }

  const models = Array.from(modelMap.values()).sort((a, b) => b.totalTokens - a.totalTokens)

  return {
    totals,
    daily,
    heatmap,
    models,
    rangeStart: localDateKey(rangeStartDate.getTime()),
    rangeEnd: localDateKey(rangeEndDate.getTime()),
    entryCount: deduped.length,
  }
}
