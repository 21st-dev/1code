import { z } from "zod"
import { publicProcedure, router } from "../index"
import { readClaudeUsage } from "../../usage/claude-reader"
import { readCodexUsage } from "../../usage/codex-reader"
import { aggregate } from "../../usage/aggregator"
import type { UsageEntry } from "../../usage/types"

const periodSchema = z.enum(["7d", "30d", "90d", "all"])
const sourceSchema = z.enum(["claude", "codex", "all"])

/**
 * In-memory cache of raw entries keyed by source. Re-reading JSONLs every
 * query is fast (<200ms) but still wasteful — a 15s cache keeps the Usage
 * page responsive when the user toggles period / source, while staying
 * fresh enough that a just-finished session shows up on the next focus.
 */
type Cached = { entries: UsageEntry[]; fetchedAt: number }
const CACHE_TTL_MS = 15_000
const cache: {
  claude: Cached | null
  codex: Cached | null
} = { claude: null, codex: null }

async function getEntries(source: "claude" | "codex"): Promise<UsageEntry[]> {
  const now = Date.now()
  const cached = cache[source]
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.entries
  }
  const entries = source === "claude" ? await readClaudeUsage() : await readCodexUsage()
  cache[source] = { entries, fetchedAt: now }
  return entries
}

function invalidate(): void {
  cache.claude = null
  cache.codex = null
}

export const usageRouter = router({
  /**
   * Aggregated stats for the period + source. The heavy lifting (glob,
   * parse, dedup, price) happens here on each call; the client just
   * re-queries when the user toggles inputs.
   */
  getOverview: publicProcedure
    .input(z.object({ period: periodSchema, source: sourceSchema }))
    .query(async ({ input }) => {
      const tasks: Promise<UsageEntry[]>[] = []
      if (input.source === "claude" || input.source === "all") {
        tasks.push(getEntries("claude"))
      }
      if (input.source === "codex" || input.source === "all") {
        tasks.push(getEntries("codex"))
      }
      const pools = await Promise.all(tasks)
      const merged = pools.flat()
      return aggregate(merged, input.period, input.source)
    }),

  /** Force the next query to re-read JSONLs from disk. */
  refresh: publicProcedure.mutation(() => {
    invalidate()
    return { ok: true }
  }),
})
