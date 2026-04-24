const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

const fullFormatter = new Intl.NumberFormat("en-US")

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n === 0) return "0"
  return compactFormatter.format(n)
}

export function formatFull(n: number): string {
  return fullFormatter.format(Math.round(n))
}

export function formatUSD(n: number, opts: { compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "$0.00"
  if (opts.compact && Math.abs(n) >= 1000) {
    return `$${compactFormatter.format(n)}`
  }
  return `$${n.toFixed(2)}`
}

/** "Apr 17" style short label for axis ticks. */
export function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
